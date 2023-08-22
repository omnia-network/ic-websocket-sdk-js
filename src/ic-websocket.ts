import {
  ActorSubclass,
  Cbor,
  HttpAgent,
} from "@dfinity/agent";
import { Principal } from "@dfinity/principal";
import * as ed from '@noble/ed25519';
import {
  deserializeClientIncomingMessage,
  serializeClientOpenMessage,
} from "./idl";
import logger from "./logger";
import { isMessageBodyValid } from "./utils";
import type {
  ActorService,
  CanisterWsMessageArguments,
  ClientIncomingMessage,
  ClientOpenMessageContent,
  WebsocketMessage,
} from "./types";

const CLIENT_SECRET_KEY_STORAGE_KEY = "ic_websocket_client_secret_key";

export type IcWebSocketConfig<T extends ActorService> = {
  /**
   * The canister id of the canister to open the websocket to.
   */
  canisterId: string;
  /**
   * The canister actor class.
   * 
   * It must implement the methods:
   * - `ws_register`
   * - `ws_message`
   */
  canisterActor: ActorSubclass<T>
  /**
   * The IC network url to use for the HttpAgent. It can be a local replica (e.g. http://localhost:4943) or the IC mainnet (https://ic0.io).
   */
  networkUrl: string;
  /**
   * If `true`, it means that the network is a local replica and the HttpAgent will fetch the root key.
   */
  localTest: boolean;
  /**
   * If `true`, the secret key will be stored in local storage and reused on subsequent page loads.
   */
  persistKey?: boolean;
};

type WsParameters = ConstructorParameters<typeof WebSocket>;

export default class IcWebSocket<T extends ActorService> {
  readonly canisterId: Principal;
  readonly agent: HttpAgent;
  readonly canisterActor: ActorSubclass<T>;
  private wsInstance: WebSocket;
  private secretKey: Uint8Array | string;
  private nextReceivedNum: number;
  private isConnectionOpen = false;

  onclose: ((this: IcWebSocket<T>, ev: CloseEvent) => any) | null = null;
  onerror: ((this: IcWebSocket<T>, ev: ErrorEvent) => any) | null = null;
  onmessage: ((this: IcWebSocket<T>, ev: MessageEvent<Uint8Array>) => any) | null = null;
  onopen: ((this: IcWebSocket<T>, ev: Event) => any) | null = null;

  /**
   * Creates a new IcWebSocket instance.
   * @param url The gateway address.
   * @param protocols The protocols to use in the WebSocket.
   * @param config The IcWebSocket configuration.
   */
  constructor(url: WsParameters[0], protocols: WsParameters[1], config: IcWebSocketConfig<T>) {
    this.canisterId = Principal.fromText(config.canisterId);

    if (!config.canisterActor.ws_register) {
      throw new Error("Canister actor does not implement the ws_register method");
    }

    if (!config.canisterActor.ws_message) {
      throw new Error("Canister actor does not implement the ws_message method");
    }

    if (config.persistKey) {
      // attempt to load the secret key from local storage (stored in hex format)
      const storedKey = localStorage.getItem(CLIENT_SECRET_KEY_STORAGE_KEY);

      if (storedKey) {
        logger.debug("[init] Using stored secret key");
        this.secretKey = storedKey;
      } else {
        logger.debug("[init] Generating and storing new secret key");
        this.secretKey = ed.utils.randomPrivateKey(); // Generate new key for this websocket connection.
        localStorage.setItem(CLIENT_SECRET_KEY_STORAGE_KEY, ed.etc.bytesToHex(this.secretKey));
      }
    } else {
      logger.debug("[init] Generating new secret key");
      this.secretKey = ed.utils.randomPrivateKey(); // Generate new key for this websocket connection.
    }

    this.canisterActor = config.canisterActor;

    this.nextReceivedNum = 0; // Received signed messages need to come in the correct order, with sequence numbers 0, 1, 2...
    this.wsInstance = new WebSocket(url, protocols); // Gateway address. Here localhost to reproduce the demo.
    this.wsInstance.binaryType = "arraybuffer";
    this._bindWsEvents();

    this.agent = new HttpAgent({ host: config.networkUrl });
    if (config.localTest) {
      this.agent.fetchRootKey();
    }
  }

  async send(data: Uint8Array) {
    if (!this.isConnectionOpen) {
      throw new Error("Connection is not open");
    }

    if (!(data instanceof Uint8Array)) {
      throw new Error("Data must be a Uint8Array");
    }

    try {
      // We send the message directly to the canister, not to the gateway
      const message = await this._makeApplicationMessage(data);
      const sendResult = await this.canisterActor.ws_message(message);

      logger.debug("[send] Message sent");

      if ("Err" in sendResult) {
        throw new Error(sendResult.Err);
      }
    } catch (error) {
      logger.error("[send] Error:", error);
      this._callOnErrorCallback(new Error(`Error sending message: ${error}`));
    }
  }

  close() {
    this.wsInstance.close();
  }

  private _bindWsEvents() {
    this.wsInstance.onopen = this._onWsOpen.bind(this);
    this.wsInstance.onmessage = this._onWsMessage.bind(this);
    this.wsInstance.onclose = this._onWsClose.bind(this);
    this.wsInstance.onerror = this._onWsError.bind(this);
  }

  private async _onWsOpen() {
    logger.debug("[onWsOpen] WebSocket opened, sending first service message");

    try {
      // Send the first message
      const wsMessage = await this._getOpenMessage();
      this.wsInstance.send(wsMessage);

      logger.debug("[onWsOpen] First service message sent");
    } catch (error) {
      logger.error("[onWsOpen] Error:", error);
      // if the first message fails, we can't continue
      this.wsInstance.close(3000, "First message failed");
    }

    // the onopen callback for the user is called when the first confirmation message is received from the canister
    // which happens in the _onWsMessage function
  }

  private async _onWsMessage(event: MessageEvent<ArrayBuffer>) {
    if (this.nextReceivedNum === 0) {
      // first received message
      logger.debug("[onWsMessage] First service message received");
      this.nextReceivedNum += 1;

      logger.info("WebSocket connection established");

      // We are ready to send messages 
      this.isConnectionOpen = true;

      this._callOnOpenCallback();
    } else {
      logger.debug("[onWsMessage] Incoming message received. Bytes:", event.data.byteLength, "bytes");

      const rawData = new Uint8Array(event.data);
      const incomingMessage = this._decodeIncomingMessage(rawData);
      const websocketMessage = this._decodeIncomingMessageContent(incomingMessage);

      const isSequenceNumValid = this._isWebsocketMessageSequenceNumberValid(websocketMessage);
      if (!isSequenceNumValid) {
        // TODO: handle out of order messages
        logger.error("[onWsMessage] Received message sequence number does not match next expected value. Message ignored.");
        this._callOnErrorCallback(new Error(`Received message sequence number does not match next expected value (${this.nextReceivedNum}). Message ignored.`));
        return;
      }
      // Increment the next expected sequence number
      this.nextReceivedNum += 1;

      this._inspectWebsocketMessageTimestamp(websocketMessage);

      const isValidMessage = await this._isIncomingMessageValid(incomingMessage);
      if (!isValidMessage) {
        logger.error("[onWsMessage] Certificate validation failed");
        this._callOnErrorCallback(new Error("Certificate validation failed"));
        return;
      }

      logger.debug("[onWsMessage] Calling onmessage callback");
      this._callOnMessageCallback(new Uint8Array(websocketMessage.message));
    }
  }

  private _onWsClose(event: CloseEvent) {
    logger.debug(`[onWsClose] WebSocket closed, code=${event.code} reason=${event.reason}`);

    this.isConnectionOpen = false;

    this._callOnCloseCallback(event);
  }

  private _onWsError(error: Event) {
    logger.error("[onWsError] Error:", error);
    this._callOnErrorCallback(new Error(`WebSocket error: ${error}`));
  }

  private async _getPublicKey(): Promise<Uint8Array> {
    return ed.getPublicKeyAsync(this.secretKey);
  }

  private async _registerPublicKeyOnCanister(): Promise<Uint8Array | undefined> {
    const publicKey = await this._getPublicKey();
    // Put the public key in the canister
    await this.canisterActor.ws_register({
      client_key: publicKey,
    });

    return publicKey;
  }

  private async _getSignedMessage(buf: Uint8Array) {
    // Sign the message so that the gateway can verify canister and client ids match
    const sig = await ed.signAsync(buf, this.secretKey);

    // Final signed websocket message
    const message = {
      content: buf,
      sig: sig,
    };

    return message;
  }

  private async _getOpenMessage() {
    const publicKey = await this._registerPublicKeyOnCanister();

    const content: ClientOpenMessageContent = {
      client_key: publicKey!,
      canister_id: this.canisterId,
    }

    // Send the first message with client and canister id
    const contentBytes = new Uint8Array(Cbor.encode(content));
    const signedMessage = await this._getSignedMessage(contentBytes);

    // Serialize the open message to send it through the websocket
    const wsMessage = serializeClientOpenMessage(signedMessage);

    return wsMessage;
  }

  private _decodeIncomingMessage(buf: Uint8Array): ClientIncomingMessage {
    return deserializeClientIncomingMessage(buf);
  }

  private async _isIncomingMessageValid(incomingMessage: ClientIncomingMessage): Promise<boolean> {
    const key = incomingMessage.key;
    const content = new Uint8Array(incomingMessage.content); // make sure it's a Uint8Array
    const cert = incomingMessage.cert;
    const tree = incomingMessage.tree;

    // Verify the certificate (canister signature)
    const isValid = await isMessageBodyValid(this.canisterId, key, content, cert, tree, this.agent);

    return isValid;
  }

  private _decodeIncomingMessageContent(incomingMessage: ClientIncomingMessage): WebsocketMessage {
    const websocketMessage = Cbor.decode<WebsocketMessage>(incomingMessage.content);

    return websocketMessage;
  }

  private _isWebsocketMessageSequenceNumberValid(incomingContent: WebsocketMessage): boolean {
    const receivedNum = incomingContent.sequence_num;
    logger.debug("[onWsMessage] Received message with sequence number", receivedNum)
    return BigInt(receivedNum) === BigInt(this.nextReceivedNum);
  }

  private _inspectWebsocketMessageTimestamp(incomingContent: WebsocketMessage) {
    const time = BigInt(incomingContent.timestamp) / BigInt(10 ** 6);
    const delayMilliseconds = BigInt(Date.now()) - time;
    logger.debug("[onWsMessage] Canister --> client latency(ms):", Number(delayMilliseconds));
  }

  private async _makeApplicationMessage(content: Uint8Array): Promise<CanisterWsMessageArguments> {
    const publicKey = await this._getPublicKey();

    return {
      msg: {
        DirectlyFromClient: {
          client_key: publicKey,
          message: content,
        },
      }
    };
  }

  private _callOnOpenCallback() {
    if (this.onopen) {
      this.onopen.call(this, new Event("open"));
    } else {
      logger.warn("[onopen] No onopen callback defined");
    }
  }

  private _callOnMessageCallback(data: Uint8Array) {
    if (this.onmessage) {
      this.onmessage.call(this, new MessageEvent("message", { data }));
    } else {
      logger.warn("[onmessage] No onmessage callback defined");
    }
  }

  private _callOnErrorCallback(error: Error) {
    if (this.onerror) {
      this.onerror.call(this, new ErrorEvent("error", { error }));
    } else {
      logger.warn("[onerror] No onerror callback defined");
    }
  }

  private _callOnCloseCallback(event: CloseEvent) {
    if (this.onclose) {
      this.onclose.call(this, event);
    } else {
      logger.warn("[onclose] No onclose callback defined");
    }
  }
}
