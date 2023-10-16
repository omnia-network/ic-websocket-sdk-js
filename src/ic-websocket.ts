import {
  Cbor,
  HttpAgent,
  SignIdentity,
} from "@dfinity/agent";
import { Principal } from "@dfinity/principal";
import {
  CanisterAckMessageContent,
  CanisterWsMessageArguments,
  ClientKeepAliveMessageContent,
  ClientKey,
  WebsocketMessage,
  _WS_CANISTER_SERVICE,
  decodeWebsocketServiceMessageContent,
  encodeWebsocketServiceMessageContent,
  isClientKeyEq,
} from "./idl";
import logger from "./logger";
import { isMessageBodyValid, randomBigInt, safeExecute } from "./utils";
import {
  isClientIncomingMessage,
  type ClientIncomingMessage,
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
const DEFAULT_ACK_MESSAGE_TIMEOUT_MS = 90000;

export type IcWebSocketConfig = {
  /**
   * The canister id of the canister to open the WebSocket to.
   */
  canisterId: string;
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
   * @default 90000 (90 seconds = 3/2 default send ack period on the canister)
   */
  ackMessageTimeout?: number;
};

type WsParameters = ConstructorParameters<typeof WebSocket>;

export default class IcWebSocket {
  public readonly canisterId: Principal;
  private readonly _httpAgent: HttpAgent;
  private _wsAgent: WsAgent | null = null;
  private readonly _wsInstance: WebSocket;
  private readonly _identity: SignIdentity;
  private _incomingSequenceNum = BigInt(1);
  private _outgoingSequenceNum = BigInt(0);
  private _isConnectionEstablished = false;
  private _incomingMessagesQueue: BaseQueue<ArrayBuffer>;
  private _outgoingMessagesQueue: BaseQueue<Uint8Array>;
  private _ackMessagesQueue: AckMessagesQueue;
  private _clientKey: ClientKey;

  onclose: ((this: IcWebSocket, ev: CloseEvent) => any) | null = null;
  onerror: ((this: IcWebSocket, ev: ErrorEvent) => any) | null = null;
  onmessage: ((this: IcWebSocket, ev: MessageEvent<Uint8Array>) => any) | null = null;
  onopen: ((this: IcWebSocket, ev: Event) => any) | null = null;

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
   * @param config The IcWebSocket configuration.
   */
  constructor(url: WsParameters[0], protocols: WsParameters[1], config: IcWebSocketConfig) {
    this.canisterId = Principal.fromText(config.canisterId);

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
    }

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

    this._wsInstance = new WebSocket(url, protocols); // Gateway address. Here localhost to reproduce the demo.
    this._wsInstance.binaryType = "arraybuffer";
    this._bindWsEvents();
  }

  public send(data: Uint8Array) {
    if (!this._isConnectionEstablished) {
      throw new Error("Connection is not established yet");
    }

    if (!(data instanceof Uint8Array)) {
      throw new Error("Data must be a Uint8Array");
    }

    this._outgoingMessagesQueue.addAndProcess(data);
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
    this._wsAgent = new WsAgent({
      identity: this._identity,
      httpAgent: this._httpAgent,
      ws: this._wsInstance,
    });

    logger.debug("[onWsOpen] WebSocket opened, sending open message");

    try {
      // Call the canister's ws_open method
      await callCanisterWsOpen(
        this.canisterId,
        this._wsAgent,
        {
          client_nonce: this._clientKey.client_nonce,
        }
      );

      this._incomingMessagesQueue.enableAndProcess();

      logger.debug("[onWsOpen] Open message sent, waiting for first open message from canister");
    } catch (error) {
      logger.error("[onWsOpen] Error:", error);
      // if the first message fails, we can't continue
      this._wsInstance.close(4000, "First message failed");
    }
  }

  private _onWsMessage(event: MessageEvent<ArrayBuffer>) {
    this._incomingMessagesQueue.addAndProcess(event.data);
  }

  private async _processIncomingMessage(message: ArrayBuffer): Promise<boolean> {
    try {
      const incomingMessage = this._decodeIncomingMessage(message);
      // Check if the incoming message is a ClientIncomingMessage
      if (!isClientIncomingMessage(incomingMessage)) {
        throw new Error("[onWsMessage] Incoming message is not a ClientIncomingMessage, ignoring message");
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
      logger.error("[onWsMessage] Error:", error);
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

    const sent = await this._sendMessage(keepAliveMessage);
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

    this._callOnCloseCallback(event);
  }

  private _onWsError(error: Event) {
    logger.error("[onWsError] Error:", error);
    this._callOnErrorCallback(new Error(`WebSocket error: ${error}`));
  }

  private _sendMessageFromQueue(messageContent: Uint8Array): Promise<boolean> {
    const message = this._makeWsMessageArguments(messageContent!);
    // we send the message via WebSocket to the gateway, which relays it to the canister
    return this._sendMessage(message);
  }

  /**
   * Sends a message to the canister via WebSocket, using a method that uses the {@link WsAgent}.
   * @param message 
   * @returns {boolean} `true` if the message was sent successfully, `false` otherwise.
   */
  private async _sendMessage(message: CanisterWsMessageArguments): Promise<boolean> {
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

  private _decodeIncomingMessage(buf: ArrayBuffer): ClientIncomingMessage {
    return Cbor.decode(buf);
  }

  private async _isIncomingMessageValid(incomingMessage: ClientIncomingMessage): Promise<boolean> {
    const key = incomingMessage.key;
    const content = new Uint8Array(incomingMessage.content); // make sure it's a Uint8Array
    const cert = incomingMessage.cert;
    const tree = incomingMessage.tree;

    // Verify the certificate (canister signature)
    const isValid = await isMessageBodyValid(this.canisterId, key, content, cert, tree, this._httpAgent);

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

  private async _callOnMessageCallback(data: Uint8Array): Promise<boolean> {
    await safeExecute(() => {
      if (this.onmessage) {
        logger.debug("[onmessage] Calling onmessage callback");
        this.onmessage.call(this, new MessageEvent("message", { data }))
      } else {
        logger.warn("[onmessage] No onmessage callback defined");
      }
    }, "Calling onmessage callback failed");

    return true;
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
