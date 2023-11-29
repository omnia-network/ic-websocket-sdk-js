import {
  Actor,
  ActorSubclass,
  Cbor,
  HttpAgent,
  SignIdentity,
} from "@dfinity/agent";
import { IDL } from "@dfinity/candid";
import { Principal } from "@dfinity/principal";
import {
  CanisterAckMessageContent,
  CanisterWsMessageArguments,
  ClientKeepAliveMessageContent,
  ClientKey,
  GetApplicationMessageType,
  WebsocketMessage,
  _WS_CANISTER_SERVICE,
  decodeWebsocketServiceMessageContent,
  encodeWebsocketServiceMessageContent,
  extractApplicationMessageIdlFromActor,
  isClientKeyEq,
} from "./idl";
import logger from "./logger";
import { isMessageBodyValid, randomBigInt, safeExecute } from "./utils";
import {
  isClientIncomingMessage,
  type ClientIncomingMessage,
  isGatewayHandshakeMessage,
  type GatewayHandshakeMessage,
} from "./types";
import { callCanisterWsMessage, callCanisterWsOpen } from "./actor";
import {
  AckMessagesQueue,
  BaseQueue,
} from "./queues";
import { WsAgent } from "./agent";

/**
 * The default expiration time for receiving an ack message from the canister after sending a message.
 * It's **3/2 times** the canister's default send ack period.
 */
const DEFAULT_ACK_MESSAGE_TIMEOUT_MS = 450_000;

/**
 * Interface to create a new IcWebSocketConfig. For a simple configuration, use {@link createWsConfig}.
 */
export interface IcWebSocketConfig<S extends _WS_CANISTER_SERVICE> {
  /**
   * The canister id of the canister to open the WebSocket to.
   */
  canisterId: string | Principal;
  /**
   * The canister actor used to serialize and deserialize the application messages.
   */
  canisterActor: ActorSubclass<S>;
  /**
   * The identity to use for signing messages. If empty, a new random temporary identity will be generated.
   */
  identity: SignIdentity,
  /**
   * The IC network url to use for the underlying agent. It can be a local replica URL (e.g. http://localhost:4943) or the IC mainnet URL (https://icp0.io).
   */
  networkUrl: string;
  /**
   * The expiration (in milliseconds) time for receiving an ack message from the canister after sending a message.
   * If the ack message is not received within this time, the connection will be closed.
   * This parameter should always me **3/2 times or more** the canister's send ack period.
   * @default 450_000 (7.5 minutes = 3/2 default send ack period on the canister)
   */
  ackMessageTimeout?: number;
  /**
   * The maximum age of the certificate received from the canister, in minutes. You won't likely need to set this parameter. Used in tests.
   * 
   * @default 5 (5 minutes)
   */
  maxCertificateAgeInMinutes?: number;
};

/**
 * Creates a new {@link IcWebSocketConfig} from arguments.
 */
export const createWsConfig = <S extends _WS_CANISTER_SERVICE>(c: IcWebSocketConfig<S>): IcWebSocketConfig<S> => c;

type WsParameters = ConstructorParameters<typeof WebSocket>;

export default class IcWebSocket<
  S extends _WS_CANISTER_SERVICE,
  ApplicationMessageType = GetApplicationMessageType<S>
> {
  public readonly canisterId: Principal;
  private readonly _canisterActor: ActorSubclass<S>;
  private readonly _applicationMessageIdl: IDL.Type<ApplicationMessageType>;
  private readonly _httpAgent: HttpAgent;
  private _wsAgent: WsAgent | null = null;
  private readonly _wsInstance: WebSocket;
  private readonly _identity: SignIdentity;
  private _incomingSequenceNum = BigInt(1);
  private _outgoingSequenceNum = BigInt(0);
  private _isHandshakeCompleted = false;
  private _isConnectionEstablished = false;
  private _incomingMessagesQueue: BaseQueue<ArrayBuffer>;
  private _outgoingMessagesQueue: BaseQueue<Uint8Array>;
  private _ackMessagesQueue: AckMessagesQueue;
  private _clientKey: ClientKey;
  private _gatewayPrincipal: Principal | null = null;
  private _maxCertificateAgeInMinutes = 5;

  onclose: ((this: IcWebSocket<S, ApplicationMessageType>, ev: CloseEvent) => any) | null = null;
  onerror: ((this: IcWebSocket<S, ApplicationMessageType>, ev: ErrorEvent) => any) | null = null;
  onmessage: ((this: IcWebSocket<S, ApplicationMessageType>, ev: MessageEvent<ApplicationMessageType>) => any) | null = null;
  onopen: ((this: IcWebSocket<S, ApplicationMessageType>, ev: Event) => any) | null = null;

  /**
   * Returns the state of the WebSocket object's connection.
   */
  get readyState(): number {
    return this._wsInstance.readyState;
  }

  // forwards the WebSocket state constants
  public readonly CLOSED = WebSocket.CLOSED;
  public readonly CLOSING = WebSocket.CLOSING;
  public readonly CONNECTING = WebSocket.CONNECTING;
  public readonly OPEN = WebSocket.OPEN;

  /**
   * Creates a new IcWebSocket instance, waiting **30 seconds** for the WebSocket to be open.
   * @param url The gateway address.
   * @param protocols The protocols to use in the WebSocket.
   * @param config The IcWebSocket configuration. Use {@link createWsConfig} to create a new configuration.
   */
  constructor(url: WsParameters[0], protocols: WsParameters[1], config: IcWebSocketConfig<S>) {
    this.canisterId = Principal.from(config.canisterId);

    if (!config.canisterActor) {
      throw new Error("Canister actor is required");
    }
    this._canisterActor = config.canisterActor;
    this._applicationMessageIdl = extractApplicationMessageIdlFromActor(this._canisterActor);

    if (!config.identity) {
      throw new Error("Identity is required");
    }
    if (!(config.identity instanceof SignIdentity)) {
      throw new Error("Identity must be a SignIdentity");
    }
    this._identity = config.identity;

    this._clientKey = {
      client_principal: this.getPrincipal(),
      client_nonce: randomBigInt(),
    };

    if (!config.networkUrl) {
      throw new Error("Network url is required");
    }

    this._httpAgent = new HttpAgent({
      host: config.networkUrl,
      identity: this._identity,
    });
    if (this._httpAgent.isLocal()) {
      void this._httpAgent.fetchRootKey();
    }

    this._incomingMessagesQueue = new BaseQueue({
      itemCallback: this._processIncomingMessage.bind(this),
      isDisabled: true,
    });

    this._outgoingMessagesQueue = new BaseQueue({
      itemCallback: this._sendMessageFromQueue.bind(this),
      isDisabled: true,
    });

    this._ackMessagesQueue = new AckMessagesQueue({
      expirationMs: config.ackMessageTimeout || DEFAULT_ACK_MESSAGE_TIMEOUT_MS,
      timeoutExpiredCallback: this._onAckMessageTimeout.bind(this),
    });

    if (config.maxCertificateAgeInMinutes) {
      this._maxCertificateAgeInMinutes = config.maxCertificateAgeInMinutes;
    }

    this._wsInstance = new WebSocket(url, protocols); // Gateway address. Here localhost to reproduce the demo.
    this._wsInstance.binaryType = "arraybuffer";
    this._bindWsEvents();
  }

  public send(message: ApplicationMessageType) {
    if (!this._isConnectionEstablished) {
      throw new Error("Connection is not established yet");
    }

    const data = IDL.encode([this._applicationMessageIdl], [message]);

    this._outgoingMessagesQueue.addAndProcess(new Uint8Array(data));
  }

  public getPrincipal(): Principal {
    return this._identity.getPrincipal();
  }

  public close() {
    this._wsInstance.close(1000);
  }

  public isConnectionEstablished(): boolean {
    return this._isConnectionEstablished;
  }

  private _bindWsEvents() {
    this._wsInstance.onopen = this._onWsOpen.bind(this);
    this._wsInstance.onmessage = this._onWsMessage.bind(this);
    this._wsInstance.onclose = this._onWsClose.bind(this);
    this._wsInstance.onerror = this._onWsError.bind(this);
  }

  private async _onWsOpen() {
    this._incomingMessagesQueue.enableAndProcess();

    logger.debug("[onWsOpen] WebSocket opened");
  }

  private _onWsMessage(event: MessageEvent<ArrayBuffer>) {
    this._incomingMessagesQueue.addAndProcess(event.data);
  }

  private async _handleHandshakeMessage(handshakeMessage: GatewayHandshakeMessage): Promise<boolean> {
    // at this point, we're sure that the gateway_principal is valid
    // because the isGatewayHandshakeMessage function checks it
    this._gatewayPrincipal = Principal.from(handshakeMessage.gateway_principal);
    this._isHandshakeCompleted = true;

    try {
      await this._sendOpenMessage();
    } catch (error) {
      logger.error("[onWsMessage] Handshake message error:", error);
      // if a handshake message fails, we can't continue
      this._wsInstance.close(4000, "Handshake message error");
      return false;
    }

    return true;
  }

  private _initializeWsAgent() {
    this._wsAgent = new WsAgent({
      identity: this._identity,
      httpAgent: this._httpAgent,
      ws: this._wsInstance,
    });
  }

  private async _sendOpenMessage() {
    this._initializeWsAgent();

    logger.debug("Sending open message");

    // Call the canister's ws_open method
    // at this point, all the class properties that we need are initialized
    await callCanisterWsOpen(
      this.canisterId,
      this._wsAgent!,
      {
        client_nonce: this._clientKey.client_nonce,
        gateway_principal: this._gatewayPrincipal!,
      }
    );

    logger.debug("Open message sent, waiting for first open message from canister");
  }

  private async _processIncomingMessage(message: ArrayBuffer): Promise<boolean> {
    try {
      const incomingMessage = this._decodeIncomingMessage(message);

      // if the handshake is not completed yet, we have to treat the first message as HandshakeMessage
      if (!this._isHandshakeCompleted) {
        if (!isGatewayHandshakeMessage(incomingMessage)) {
          throw new Error("First message is not a GatewayHandshakeMessage");
        }

        return this._handleHandshakeMessage(incomingMessage);
      }

      // Check if the incoming message is a ClientIncomingMessage
      if (!isClientIncomingMessage(incomingMessage)) {
        throw new Error("Incoming message is not a ClientIncomingMessage");
      }

      logger.debug("[onWsMessage] Incoming message received. Bytes:", message.byteLength, "bytes");

      const websocketMessage = this._decodeIncomingMessageContent(incomingMessage);

      const isValidMessage = await this._isIncomingMessageValid(incomingMessage);
      if (!isValidMessage) {
        throw new Error("[onWsMessage] Certificate validation failed");
      }

      const isSequenceNumValid = this._isWebsocketMessageSequenceNumberValid(websocketMessage);
      if (!isSequenceNumValid) {
        throw new Error(`[onWsMessage] Received message sequence number does not match next expected value. Expected: ${this._incomingSequenceNum}, received: ${websocketMessage.sequence_num}`);
      }
      // Increment the next expected sequence number
      this._incomingSequenceNum++;

      // handle the case in which the content is a service message
      if (websocketMessage.is_service_message) {
        logger.debug("[onWsMessage] Received service message from canister");
        return this._handleServiceMessage(websocketMessage.content as Uint8Array);
      }

      this._inspectWebsocketMessageTimestamp(websocketMessage);

      await this._callOnMessageCallback(new Uint8Array(websocketMessage.content));
    } catch (error) {
      // for any error, we can't continue
      logger.error("[onWsMessage]", error);
      this._callOnErrorCallback(new Error(`Error receiving message: ${error}`));
      this._wsInstance.close(4000, "Error receiving message");
      return false;
    }

    return true;
  }

  private async _handleServiceMessage(content: Uint8Array): Promise<boolean> {
    try {
      const serviceMessage = decodeWebsocketServiceMessageContent(content as Uint8Array);
      if ("OpenMessage" in serviceMessage) {
        logger.debug("[onWsMessage] Received open message from canister");
        if (!isClientKeyEq(serviceMessage.OpenMessage.client_key, this._clientKey)) {
          throw new Error("Client key does not match");
        }

        this._isConnectionEstablished = true;

        this._callOnOpenCallback();

        this._outgoingMessagesQueue.enableAndProcess();
      } else if ("AckMessage" in serviceMessage) {
        await this._handleAckMessageFromCanister(serviceMessage.AckMessage);
      } else {
        throw new Error("Invalid service message from canister");
      }
    } catch (error) {
      logger.error("[onWsMessage] Service message error:", error);
      // if a service message fails, we can't continue
      this._wsInstance.close(4000, "Service message error");
      return false;
    }

    return true;
  }

  private async _handleAckMessageFromCanister(content: CanisterAckMessageContent): Promise<void> {
    const lastAckSequenceNumberFromCanister = BigInt(content.last_incoming_sequence_num);
    logger.debug("[onWsMessage] Received ack message from canister with sequence number", lastAckSequenceNumberFromCanister);

    try {
      this._ackMessagesQueue.ack(lastAckSequenceNumberFromCanister);
    } catch (error) {
      logger.error("[onWsMessage] Ack message error:", error);
      this._callOnErrorCallback(new Error(`Ack message error: ${error}`));
      return this._wsInstance.close(4000, "Ack message error");
    }

    await this._sendKeepAliveMessage();
  }

  private async _sendKeepAliveMessage(): Promise<void> {
    const keepAliveMessageContent: ClientKeepAliveMessageContent = {
      last_incoming_sequence_num: this._incomingSequenceNum - BigInt(1),
    };
    const bytes = encodeWebsocketServiceMessageContent({
      KeepAliveMessage: keepAliveMessageContent,
    });
    const keepAliveMessage = this._makeWsMessageArguments(new Uint8Array(bytes), true);

    const sent = await this._sendMessageToCanister(keepAliveMessage);
    if (!sent) {
      logger.error("[onWsMessage] Keep alive message was not sent");
      this._callOnErrorCallback(new Error("Keep alive message was not sent"));
      this._wsInstance.close(4000, "Keep alive message was not sent");
    }
  }

  private _onAckMessageTimeout(notReceivedAcks: bigint[]) {
    logger.error("[onAckMessageTimeout] Ack message timeout. Not received ack for sequence numbers:", notReceivedAcks);
    this._callOnErrorCallback(new Error(`Ack message timeout. Not received ack for sequence numbers: ${notReceivedAcks}`));
    this._wsInstance.close(4000, "Ack message timeout");
  }

  private _onWsClose(event: CloseEvent) {
    logger.debug(`[onWsClose] WebSocket closed, code=${event.code} reason=${event.reason}`);

    this._isConnectionEstablished = false;
    this._incomingMessagesQueue.disable();
    this._outgoingMessagesQueue.disable();
    this._ackMessagesQueue.clear();

    this._callOnCloseCallback(event);
  }

  private _onWsError(error: Event) {
    logger.error("[onWsError]", error);
    this._callOnErrorCallback(new Error(`WebSocket error: ${error}`));
  }

  private _sendMessageFromQueue(messageContent: Uint8Array): Promise<boolean> {
    const message = this._makeWsMessageArguments(messageContent!);
    // we send the message via WebSocket to the gateway, which relays it to the canister
    return this._sendMessageToCanister(message);
  }

  /**
   * Sends a message to the canister via WebSocket, using a method that uses the {@link WsAgent}.
   * @param message 
   * @returns {boolean} `true` if the message was sent successfully, `false` otherwise.
   */
  private async _sendMessageToCanister(message: CanisterWsMessageArguments): Promise<boolean> {
    // we don't need to wait for the response,
    // as we'll receive the ack message via WebSocket from the canister
    try {
      await callCanisterWsMessage(
        this.canisterId,
        this._wsAgent!,
        message
      );

      // add the sequence number to the ack messages queue
      this._ackMessagesQueue.add(message.msg.sequence_num);

      logger.debug("[send] Message sent");
    } catch (error) {
      // the ws agent already tries 3 times under the hood, so if we get an error here, we can't continue
      logger.error("[send] Message sending failed:", error);
      this._callOnErrorCallback(new Error(`Message sending failed: ${error}`));
      this._wsInstance.close(4000, "Message sending failed");
      return false;
    }

    return true;
  }

  /**
   * CBOR decodes the incoming message from an ArrayBuffer and returns an object.
   *
   * @param {ArrayBuffer} buf - The ArrayBuffer containing the encoded message.
   * @returns {any} The decoded object.
   */
  private _decodeIncomingMessage(buf: ArrayBuffer): any {
    return Cbor.decode(buf);
  }

  private async _isIncomingMessageValid(incomingMessage: ClientIncomingMessage): Promise<boolean> {
    const key = incomingMessage.key;
    const content = new Uint8Array(incomingMessage.content); // make sure it's a Uint8Array
    const cert = incomingMessage.cert;
    const tree = incomingMessage.tree;

    // Verify the certificate (canister signature)
    const isValid = await isMessageBodyValid(
      this.canisterId,
      key,
      content,
      cert,
      tree,
      this._httpAgent,
      this._maxCertificateAgeInMinutes,
    );

    return isValid;
  }

  private _decodeIncomingMessageContent(incomingMessage: ClientIncomingMessage): WebsocketMessage {
    const websocketMessage = Cbor.decode<WebsocketMessage>(incomingMessage.content);

    return websocketMessage;
  }

  private _isWebsocketMessageSequenceNumberValid(incomingContent: WebsocketMessage): boolean {
    const receivedNum = incomingContent.sequence_num;
    logger.debug("[onWsMessage] Received message with sequence number", receivedNum)
    return BigInt(receivedNum) === this._incomingSequenceNum;
  }

  private _inspectWebsocketMessageTimestamp(incomingContent: WebsocketMessage) {
    const time = BigInt(incomingContent.timestamp) / BigInt(10 ** 6);
    const delayMilliseconds = BigInt(Date.now()) - time;
    logger.debug("[onWsMessage] Canister --> client latency(ms):", Number(delayMilliseconds));
  }

  private _makeWsMessageArguments(content: Uint8Array, isServiceMessage = false): CanisterWsMessageArguments {
    this._outgoingSequenceNum++;

    const outgoingMessage: WebsocketMessage = {
      client_key: this._clientKey,
      sequence_num: this._outgoingSequenceNum,
      timestamp: BigInt(Date.now()) * BigInt(10 ** 6),
      content,
      is_service_message: isServiceMessage,
    };

    return {
      msg: outgoingMessage,
    };
  }

  private _callOnOpenCallback() {
    safeExecute(() => {
      if (this.onopen) {
        logger.debug("[onopen] Calling onopen callback");
        this.onopen.call(this, new Event("open"))
      } else {
        logger.warn("[onopen] No onopen callback defined");
      }
    }, "Calling onopen callback failed");
  }

  private async _callOnMessageCallback(data: Uint8Array): Promise<void> {
    if (this.onmessage) {
      logger.debug("[onmessage] Calling onmessage callback");
      const decoded = IDL.decode([this._applicationMessageIdl], data)[0] as ApplicationMessageType;

      await safeExecute(() => {
        this.onmessage!.call(this, new MessageEvent("message", { data: decoded }))
      }, "Calling onmessage callback failed");

    } else {
      logger.warn("[onmessage] No onmessage callback defined");
    }
  }

  private _callOnErrorCallback(error: Error) {
    safeExecute(() => {
      if (this.onerror) {
        logger.debug("[onerror] Calling onerror callback");
        this.onerror.call(this, new ErrorEvent("error", { error }));
      } else {
        logger.warn("[onerror] No onerror callback defined");
      }
    }, "Calling onerror callback failed");
  }

  private _callOnCloseCallback(event: CloseEvent) {
    safeExecute(() => {
      if (this.onclose) {
        logger.debug("[onclose] Calling onclose callback");
        this.onclose.call(this, event);
      } else {
        logger.warn("[onclose] No onclose callback defined");
      }
    }, "Calling onclose callback failed");
  }
}
