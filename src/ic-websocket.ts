import {
  ActorSubclass,
  Cbor,
  HttpAgent,
  SignIdentity,
  WsAgent
} from "@dfinity/agent";
import { Principal } from "@dfinity/principal";
import { generateRandomIdentity } from "./identity";
import {
  CanisterWsMessageArguments,
  WebsocketMessage,
  _WS_CANISTER_SERVICE,
} from "./idl";
import logger from "./logger";
import { isMessageBodyValid } from "./utils";
import {
  isClientIncomingMessage,
  type ClientIncomingMessage,
} from "./types";
import { createWsActor } from "./actor";

export type IcWebSocketConfig = {
  /**
   * The canister id of the canister to open the WebSocket to.
   */
  canisterId: string;
  /**
   * The identity to use for signing messages. If empty, a new random temporary identity will be generated.
   */
  identity?: SignIdentity,
  /**
   * The IC network url to use for the underlying agent. It can be a local replica URL (e.g. http://localhost:4943) or the IC mainnet URL (https://icp0.io).
   */
  networkUrl: string;
};

type WsParameters = ConstructorParameters<typeof WebSocket>;

export default class IcWebSocket {
  public readonly canisterId: Principal;
  private readonly _httpAgent: HttpAgent;
  private _wsAgent: WsAgent | null = null;
  private _wsActor: ActorSubclass<_WS_CANISTER_SERVICE> | null = null;
  private readonly _wsInstance: WebSocket;
  private readonly _identity: SignIdentity;
  private readonly _isAnonymous: boolean;
  private _incomingSequenceNum = BigInt(1);
  private _outgoingSequenceNum = BigInt(0);
  private _isConnectionEstablished = false;
  private _receivedMessagesQueue: Uint8Array[] = [];

  onclose: ((this: IcWebSocket, ev: CloseEvent) => any) | null = null;
  onerror: ((this: IcWebSocket, ev: ErrorEvent) => any) | null = null;
  onmessage: ((this: IcWebSocket, ev: MessageEvent<Uint8Array>) => any) | null = null;
  onopen: ((this: IcWebSocket, ev: Event) => any) | null = null;

  /**
   * Creates a new IcWebSocket instance, waiting **30 seconds** for the WebSocket to be open.
   * @param url The gateway address.
   * @param protocols The protocols to use in the WebSocket.
   * @param config The IcWebSocket configuration.
   */
  constructor(url: WsParameters[0], protocols: WsParameters[1], config: IcWebSocketConfig) {
    this.canisterId = Principal.fromText(config.canisterId);

    if (config.identity) {
      if (!(config.identity instanceof SignIdentity)) {
        throw new Error("Identity must be a SignIdentity");
      }

      this._identity = config.identity;
      this._isAnonymous = false;
    } else {
      this._identity = generateRandomIdentity();
      this._isAnonymous = true;
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

    this._wsInstance = new WebSocket(url, protocols); // Gateway address. Here localhost to reproduce the demo.
    this._wsInstance.binaryType = "arraybuffer";
    this._bindWsEvents();
  }

  public async send(data: Uint8Array) {
    if (!this._isConnectionEstablished) {
      throw new Error("Connection is not established yet");
    }

    if (!(data instanceof Uint8Array)) {
      throw new Error("Data must be a Uint8Array");
    }

    try {
      // We send the message via WebSocket to the gateway, which relays it to the canister
      this._outgoingSequenceNum++;
      const message = this._makeApplicationMessage(data);
      const sendResult = await this._wsActor!.ws_message(message);

      if ("Err" in sendResult) {
        this._outgoingSequenceNum--;
        throw new Error(sendResult.Err);
      }

      logger.debug("[send] Message sent");
    } catch (error) {
      logger.error("[send] Error:", error);
      this._callOnErrorCallback(new Error(`Error sending message: ${error}`));
    }
  }

  public getPrincipal(): Principal {
    return this._identity.getPrincipal();
  }

  public close() {
    this._wsInstance.close();
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

    if (this._httpAgent.isLocal()) {
      void this._wsAgent.fetchRootKey();
    }

    this._wsActor = createWsActor(this.canisterId, {
      agent: this._wsAgent,
    });

    logger.debug("[onWsOpen] WebSocket opened, sending open message");

    try {
      // Call the canister's ws_open method
      const openResult = await this._wsActor.ws_open({ is_anonymous: this._isAnonymous });

      if ("Err" in openResult) {
        throw new Error(openResult.Err);
      }

      const result = openResult.Ok;
      if (result.client_principal.compareTo(this.getPrincipal()) !== "eq") {
        throw new Error("Client principal does not match");
      }

      this._isConnectionEstablished = true;
      this._processReceivedMessagesQueue();

      logger.debug("[onWsOpen] Open message sent, connection established");
      
      this._callOnOpenCallback();
    } catch (error) {
      logger.error("[onWsOpen] Error:", error);
      // if the first message fails, we can't continue
      this._wsInstance.close(3000, "First message failed");
    }
  }

  private async _onWsMessage(event: MessageEvent<ArrayBuffer>) {
    const incomingMessage = this._decodeIncomingMessage(event.data);
    // Check if the incoming message is a ClientIncomingMessage
    if (!isClientIncomingMessage(incomingMessage)) {
      logger.debug("[onWsMessage] Incoming message is not a ClientIncomingMessage, ignoring message");
      return;
    }

    logger.debug("[onWsMessage] Incoming message received. Bytes:", event.data.byteLength, "bytes");

    const websocketMessage = this._decodeIncomingMessageContent(incomingMessage);

    const isValidMessage = await this._isIncomingMessageValid(incomingMessage);
    if (!isValidMessage) {
      logger.error("[onWsMessage] Certificate validation failed");
      this._callOnErrorCallback(new Error("Certificate validation failed"));
      return;
    }

    const isSequenceNumValid = this._isWebsocketMessageSequenceNumberValid(websocketMessage);
    if (!isSequenceNumValid) {
      // TODO: handle out of order messages
      logger.error("[onWsMessage] Received message sequence number does not match next expected value. Message ignored.");
      this._callOnErrorCallback(new Error(`Received message sequence number does not match next expected value (${this._incomingSequenceNum}). Message ignored.`));
      return;
    }
    // Increment the next expected sequence number
    this._incomingSequenceNum++;

    this._inspectWebsocketMessageTimestamp(websocketMessage);

    this._addReceivedMessageToQueue(new Uint8Array(websocketMessage.content));
    this._processReceivedMessagesQueue();
  }

  private _onWsClose(event: CloseEvent) {
    logger.debug(`[onWsClose] WebSocket closed, code=${event.code} reason=${event.reason}`);

    this._isConnectionEstablished = false;

    this._callOnCloseCallback(event);
  }

  private _onWsError(error: Event) {
    logger.error("[onWsError] Error:", error);
    this._callOnErrorCallback(new Error(`WebSocket error: ${error}`));
  }

  private _addReceivedMessageToQueue(messageContent: Uint8Array) {
    this._receivedMessagesQueue.push(messageContent);
  }

  private _processReceivedMessagesQueue() {
    if (!this._isConnectionEstablished) {
      return;
    }

    while (this._receivedMessagesQueue.length > 0) {
      const messageContent = this._receivedMessagesQueue.shift();
      if (!messageContent) {
        break;
      }

      this._callOnMessageCallback(messageContent);
    }
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

  private _makeApplicationMessage(content: Uint8Array): CanisterWsMessageArguments {
    const outgoingMessage: WebsocketMessage = {
      client_principal: this.getPrincipal(),
        sequence_num: this._outgoingSequenceNum,
        timestamp: BigInt(Date.now()) * BigInt(10 ** 6),
        content,
    };

    return {
      msg: outgoingMessage,
    };
  }

  private _callOnOpenCallback() {
    logger.debug("[onopen] Calling onopen callback");
    if (this.onopen) {
      this.onopen.call(this, new Event("open"));
    } else {
      logger.warn("[onopen] No onopen callback defined");
    }
  }

  private _callOnMessageCallback(data: Uint8Array) {
    logger.debug("[onmessage] Calling onmessage callback");
    if (this.onmessage) {
      this.onmessage.call(this, new MessageEvent("message", { data }));
    } else {
      logger.warn("[onmessage] No onmessage callback defined");
    }
  }

  private _callOnErrorCallback(error: Error) {
    logger.debug("[onerror] Calling onerror callback");
    if (this.onerror) {
      this.onerror.call(this, new ErrorEvent("error", { error }));
    } else {
      logger.warn("[onerror] No onerror callback defined");
    }
  }

  private _callOnCloseCallback(event: CloseEvent) {
    logger.debug("[onclose] Calling onclose callback");
    if (this.onclose) {
      this.onclose.call(this, event);
    } else {
      logger.warn("[onclose] No onclose callback defined");
    }
  }
}
