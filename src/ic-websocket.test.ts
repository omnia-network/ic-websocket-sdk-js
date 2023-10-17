import WsMockServer from "jest-websocket-mock";
import { rest } from "msw";
import { setupServer } from "msw/node";
import { CallRequest, Cbor, fromHex } from "@dfinity/agent";
import { IDL } from "@dfinity/candid";

import IcWebSocket, { createWsConfig } from "./ic-websocket";
import { Principal } from "@dfinity/principal";
import { generateRandomIdentity } from "./identity";
import { CanisterWsMessageArguments, CanisterWsOpenArguments, WebsocketServiceMessageContent, _WS_CANISTER_SERVICE, decodeWebsocketServiceMessageContent, wsMessageIdl, wsOpenIdl } from "./idl";
import { canisterId, client1Key } from "./test/clients";
import { INVALID_MESSAGE_KEY, VALID_ACK_MESSAGE, VALID_MESSAGE_SEQ_NUM_2, VALID_MESSAGE_SEQ_NUM_3, VALID_OPEN_MESSAGE } from "./test/messages";
import { sleep } from "./test/helpers";
import { getTestCanisterActor, getTestCanisterActorWithoutMethods, getTestCanisterActorWrongArgs, getTestCanisterActorWrongOpt } from "./test/actor";
import type { WsAgentRequestMessage } from "./agent/types";

const wsGatewayAddress = "ws://127.0.0.1:8080";
// the canister from which the application message was sent (needed to verify the message certificate)
const icNetworkUrl = "http://127.0.0.1:8081";

const testCanisterActor = getTestCanisterActor(canisterId);

const icWebsocketConfig = createWsConfig({
  canisterId: canisterId.toText(),
  canisterActor: testCanisterActor,
  networkUrl: icNetworkUrl,
  identity: generateRandomIdentity(),
});

//// Mock Servers
let mockWsServer: WsMockServer;
const mockReplica = setupServer(
  rest.get(`${icNetworkUrl}/api/v2/status`, (_req, res, ctx) => {
    return res(
      ctx.status(200),
      // this response was generated from the same local replica
      // used to generate the messages below
      ctx.body(fromHex("d9d9f7a66e69635f6170695f76657273696f6e66302e31382e3068726f6f745f6b65795885308182301d060d2b0601040182dc7c0503010201060c2b0601040182dc7c05030201036100948a091fa3439c49aa8782da536348bba3a525cc0b63c0e202797ae7baf38f615e5375b694818b4a1a5b0fb07242aede15eb79f6454c19c1ee54fd8b9c14dbb06d94df2f2a3cc4f6336f0419680025f4411f0d764aa0b6e9fd246ba71a80fad66c696d706c5f76657273696f6e65302e382e3069696d706c5f68617368784030343366663064393237626337313431643761643630616235646331313934636364303164393761386431633333393632643236663730323461646463336135757265706c6963615f6865616c74685f737461747573676865616c746879706365727469666965645f686569676874181b")),
    );
  }),
);
mockReplica.listen();

describe("IcWebsocket class", () => {
  beforeEach(() => {
    mockWsServer = new WsMockServer(wsGatewayAddress);
  });

  afterEach(() => {
    mockWsServer.close();
  });

  it("throws an error if the WebSocket Gateway is not available", async () => {
    const onOpen = jest.fn();
    const onError = jest.fn();
    const icWs = new IcWebSocket("ws://127.0.0.1:1234", undefined, icWebsocketConfig);
    icWs.onopen = onOpen;
    icWs.onerror = onError;
    expect(icWs).toBeDefined();

    await sleep(100);

    expect(onOpen).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalled();
  });

  it("throws an error if the canisterActor is not provided", () => {
    const icWsConfig = createWsConfig({ ...icWebsocketConfig });
    // @ts-ignore
    delete icWsConfig.canisterActor;

    expect(() => new IcWebSocket(wsGatewayAddress, undefined, icWsConfig)).toThrowError("Canister actor is required");
  });

  it("throws errors if the canisterActor is not compatible", () => {
    let icWsConfig = createWsConfig({ ...icWebsocketConfig });
    icWsConfig.canisterActor = getTestCanisterActorWithoutMethods(canisterId);
    expect(() => new IcWebSocket(wsGatewayAddress, undefined, icWsConfig)).toThrowError("Canister does not implement ws_message method");

    icWsConfig = createWsConfig({ ...icWebsocketConfig });
    icWsConfig.canisterActor = getTestCanisterActorWrongArgs(canisterId);
    expect(() => new IcWebSocket(wsGatewayAddress, undefined, icWsConfig)).toThrowError("ws_message method must have 2 arguments");

    icWsConfig = createWsConfig({ ...icWebsocketConfig });
    icWsConfig.canisterActor = getTestCanisterActorWrongOpt(canisterId);
    expect(() => new IcWebSocket(wsGatewayAddress, undefined, icWsConfig)).toThrowError("Application message type must be optional in the ws_message arguments");
  });

  it("throws an error if the identity is not provided", () => {
    const icWsConfig = createWsConfig({ ...icWebsocketConfig });
    // @ts-ignore
    delete icWsConfig.identity;

    expect(() => new IcWebSocket(wsGatewayAddress, undefined, icWsConfig)).toThrowError("Identity is required");
  });

  it("throws an error if the identity provided is not a SignIdentity", () => {
    const icWsConfig = createWsConfig({ ...icWebsocketConfig });
    // @ts-ignore
    icWsConfig.identity = {};

    expect(() => new IcWebSocket(wsGatewayAddress, undefined, icWsConfig)).toThrowError("Identity must be a SignIdentity");
  });

  it("throws an error if the networkUrl is not provided", () => {
    const icWsConfig = createWsConfig({ ...icWebsocketConfig });
    // @ts-ignore
    delete icWsConfig.networkUrl;

    expect(() => new IcWebSocket(wsGatewayAddress, undefined, icWsConfig)).toThrowError("Network url is required");
  });

  it("creates a new instance and sends the open message", async () => {
    const icWs = new IcWebSocket(wsGatewayAddress, undefined, icWebsocketConfig);
    expect(icWs).toBeDefined();
    await mockWsServer.connected;

    // get the open message sent by the client from the mock websocket server
    const openMessageBytes = await mockWsServer.nextMessage as ArrayBuffer;

    // reconstruct the message that the client should send
    const clientKey = icWs["_clientKey"];
    const { envelope: { content: openMessageContent } }: WsAgentRequestMessage<CallRequest> = Cbor.decode(openMessageBytes);

    expect(canisterId.compareTo(
      Principal.fromUint8Array(new Uint8Array(openMessageContent.canister_id as unknown as Uint8Array))
    )).toEqual("eq");
    expect(clientKey.client_principal.compareTo(
      Principal.fromUint8Array(new Uint8Array(openMessageContent.sender as Uint8Array))
    )).toEqual("eq");
    expect(openMessageContent.method_name).toEqual("ws_open");
    expect(IDL.decode(wsOpenIdl.argTypes, openMessageContent.arg)[0]).toMatchObject<CanisterWsOpenArguments>({
      client_nonce: clientKey.client_nonce,
    });
  });

  it("onopen is called when open message from canister is received", async () => {
    const onOpen = jest.fn();
    const onMessage = jest.fn();
    const icWs = new IcWebSocket(wsGatewayAddress, undefined, icWebsocketConfig);
    expect(icWs).toBeDefined();
    icWs.onopen = onOpen;
    icWs.onmessage = onMessage;
    await mockWsServer.connected;

    expect(onOpen).not.toHaveBeenCalled();
    expect(icWs["_isConnectionEstablished"]).toEqual(false);
    expect(onMessage).not.toHaveBeenCalled();

    // wait for the open message from the client
    await mockWsServer.nextMessage;

    // workaround to simulate the client identity
    icWs["_clientKey"] = client1Key;
    // send the open confirmation message from the canister
    mockWsServer.send(Cbor.encode(VALID_OPEN_MESSAGE));
    await sleep(100);

    expect(onOpen).toHaveBeenCalled();
    expect(icWs["_isConnectionEstablished"]).toEqual(true);
    // make sure onmessage callback is not called when receiving the first message
    expect(onMessage).not.toHaveBeenCalled();
  });

  it("onmessage is called when a valid message is received", async () => {
    const onMessage = jest.fn();
    const onError = jest.fn();
    const icWs = new IcWebSocket(wsGatewayAddress, undefined, icWebsocketConfig);
    expect(icWs).toBeDefined();
    icWs.onmessage = onMessage;
    icWs.onerror = onError;
    await mockWsServer.connected;

    const originalClientKey = { ...icWs["_clientKey"] };
    // workaround to simulate the client identity
    icWs["_clientKey"] = client1Key;
    // send the open confirmation message from the canister
    mockWsServer.send(Cbor.encode(VALID_OPEN_MESSAGE));
    await sleep(100);
    // set the client key back
    icWs["_clientKey"] = originalClientKey;

    expect(onMessage).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();

    // send an application message from the canister
    mockWsServer.send(Cbor.encode(VALID_MESSAGE_SEQ_NUM_2));

    // wait for the message to be processed
    await sleep(100);

    expect(onMessage).toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("fails if a message with a wrong sequence number is received", async () => {
    const onMessage = jest.fn();
    const onError = jest.fn();
    const onClose = jest.fn();
    const icWs = new IcWebSocket(wsGatewayAddress, undefined, icWebsocketConfig);
    expect(icWs).toBeDefined();
    icWs.onmessage = onMessage;
    icWs.onerror = onError;
    icWs.onclose = onClose;
    await mockWsServer.connected;

    const originalClientKey = { ...icWs["_clientKey"] };
    // workaround to simulate the client identity
    icWs["_clientKey"] = client1Key;
    // send the open confirmation message from the canister
    mockWsServer.send(Cbor.encode(VALID_OPEN_MESSAGE));
    await sleep(100);
    // set the client key back
    icWs["_clientKey"] = originalClientKey;

    expect(onMessage).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();

    // send an application message from the canister
    mockWsServer.send(Cbor.encode(VALID_MESSAGE_SEQ_NUM_3));

    // wait for the message to be processed
    await sleep(100);

    expect(onMessage).not.toHaveBeenCalled();
    const seqNumError = new Error("[onWsMessage] Received message sequence number does not match next expected value. Expected: 2, received: 3");
    expect(onError).toHaveBeenCalledWith(new ErrorEvent("error", { error: new Error(`Error receiving message: ${seqNumError}`) }));
    expect(onClose).toHaveBeenCalled();
  });

  it("fails if a message with a wrong certificate is received", async () => {
    const onMessage = jest.fn();
    const onError = jest.fn();
    const onClose = jest.fn();
    const icWs = new IcWebSocket(wsGatewayAddress, undefined, icWebsocketConfig);
    expect(icWs).toBeDefined();
    icWs.onmessage = onMessage;
    icWs.onerror = onError;
    icWs.onclose = onClose;
    await mockWsServer.connected;

    const originalClientKey = { ...icWs["_clientKey"] };
    // workaround to simulate the client identity
    icWs["_clientKey"] = client1Key;
    // send the open confirmation message from the canister
    mockWsServer.send(Cbor.encode(VALID_OPEN_MESSAGE));
    await sleep(100);
    // set the client key back
    icWs["_clientKey"] = originalClientKey;

    expect(onMessage).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();

    // send an application message from the canister
    mockWsServer.send(Cbor.encode(INVALID_MESSAGE_KEY));

    // wait for the message to be processed
    await sleep(100);

    expect(onMessage).not.toHaveBeenCalled();
    const invalidCertificateError = new Error("[onWsMessage] Certificate validation failed");
    expect(onError).toHaveBeenCalledWith(new ErrorEvent("error", { error: new Error(`Error receiving message: ${invalidCertificateError}`) }));
    expect(onClose).toHaveBeenCalled();
  });

  it("fails to send messages if the connection is not established", async () => {
    const icWs = new IcWebSocket(wsGatewayAddress, undefined, icWebsocketConfig);
    expect(icWs).toBeDefined();
    await mockWsServer.connected;

    expect(() => icWs.send({ text: "test" })).toThrowError("Connection is not established yet");
  });

  it("messages are sent if the connection is established", async () => {
    const icWs = new IcWebSocket(wsGatewayAddress, undefined, icWebsocketConfig);
    expect(icWs).toBeDefined();
    await mockWsServer.connected;

    // wait for the open message from the client
    await mockWsServer.nextMessage;

    const originalClientKey = { ...icWs["_clientKey"] };
    // workaround to simulate the client identity
    icWs["_clientKey"] = client1Key;
    // send the open confirmation message from the canister
    mockWsServer.send(Cbor.encode(VALID_OPEN_MESSAGE));
    await sleep(100);
    // set the client key back
    icWs["_clientKey"] = originalClientKey;

    const applicationMessageContent = { text: "test" };

    icWs.send(applicationMessageContent);

    // wait for the second message from the client
    const secondReceivedMessageBytes = await mockWsServer.nextMessage as ArrayBuffer;

    // reconstruct the message that the client should send
    const { envelope: { content: envelopeContent } }: WsAgentRequestMessage<CallRequest> = Cbor.decode(secondReceivedMessageBytes);

    expect(canisterId.compareTo(
      Principal.fromUint8Array(new Uint8Array(envelopeContent.canister_id as unknown as Uint8Array))
    )).toEqual("eq");
    expect(originalClientKey.client_principal.compareTo(
      Principal.fromUint8Array(new Uint8Array(envelopeContent.sender as Uint8Array))
    )).toEqual("eq");
    expect(envelopeContent.method_name).toEqual("ws_message");
    const wsMessageArgs = IDL.decode(wsMessageIdl.argTypes, envelopeContent.arg) as unknown as [CanisterWsMessageArguments, IDL.OptClass<IDL.NullClass>];
    expect(wsMessageArgs[0]).toMatchObject<CanisterWsMessageArguments>({
      msg: {
        client_key: originalClientKey,
        content: expect.any(Uint8Array), // tested below
        is_service_message: false,
        sequence_num: BigInt(1),
        timestamp: expect.any(BigInt),
      },
    });
    expect(IDL.decode([IDL.Record({ 'text': IDL.Text })], wsMessageArgs[0].msg.content as Uint8Array)[0]).toMatchObject(applicationMessageContent);
    expect(wsMessageArgs[1]).toEqual([]); // check that we're not sending unneeded arguments
  });
});

describe("Messages acknowledgement", () => {
  beforeEach(() => {
    mockWsServer = new WsMockServer(wsGatewayAddress);
  });

  afterEach(() => {
    mockWsServer.close();
  });

  it("fails if messages are not acknowledged in time", async () => {
    const ackMessageTimeoutMs = 2000;
    const icWsConfig = createWsConfig({
      ...icWebsocketConfig,
      ackMessageTimeout: ackMessageTimeoutMs,
    });
    const onError = jest.fn();
    const onClose = jest.fn();
    const icWs = new IcWebSocket(wsGatewayAddress, undefined, icWsConfig);
    expect(icWs).toBeDefined();
    icWs.onerror = onError;
    icWs.onclose = onClose;
    await mockWsServer.connected;

    // wait for the open message from the client
    await mockWsServer.nextMessage;

    const originalClientKey = { ...icWs["_clientKey"] };
    // workaround to simulate the client identity
    icWs["_clientKey"] = client1Key;
    // send the open confirmation message from the canister
    mockWsServer.send(Cbor.encode(VALID_OPEN_MESSAGE));
    await sleep(100);
    // set the client key back
    icWs["_clientKey"] = originalClientKey;

    // send a random application message
    icWs.send({ text: "test" });

    // wait for the second message from the client
    await mockWsServer.nextMessage;

    await sleep(ackMessageTimeoutMs);

    const ackTimeoutError = new Error(`Ack message timeout. Not received ack for sequence numbers: ${[BigInt(1)]}`);
    expect(onError).toHaveBeenCalledWith(new ErrorEvent("error", { error: ackTimeoutError }));
    await sleep(10);
    expect(onClose).toHaveBeenCalled();
  });

  it("acknowledges messages", async () => {
    const ackMessageTimeoutMs = 2000;
    const icWsConfig = createWsConfig({
      ...icWebsocketConfig,
      ackMessageTimeout: ackMessageTimeoutMs,
    });
    const onMessage = jest.fn();
    const onError = jest.fn();
    const onClose = jest.fn();
    const icWs = new IcWebSocket(wsGatewayAddress, undefined, icWsConfig);
    expect(icWs).toBeDefined();
    icWs.onmessage = onMessage;
    icWs.onerror = onError;
    icWs.onclose = onClose;
    await mockWsServer.connected;

    // wait for the open message from the client
    await mockWsServer.nextMessage;

    const originalClientKey = { ...icWs["_clientKey"] };
    // workaround to simulate the client identity
    icWs["_clientKey"] = client1Key;
    // send the open confirmation message from the canister
    mockWsServer.send(Cbor.encode(VALID_OPEN_MESSAGE));
    await sleep(100);
    // set the client key back
    icWs["_clientKey"] = originalClientKey;

    // send a random application message
    icWs.send({ text: "test" });

    // wait for the second message from the client
    await mockWsServer.nextMessage;

    // send the ack message from the canister
    mockWsServer.send(Cbor.encode(VALID_ACK_MESSAGE));

    // wait until the ack timeout should expire
    await sleep(ackMessageTimeoutMs);

    expect(onError).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    // make sure onmessage is not called for service messages
    expect(onMessage).not.toHaveBeenCalled();
  });

  it("send an ack message after receiving the ack", async () => {
    const ackMessageTimeoutMs = 2000;
    const icWsConfig = createWsConfig({
      ...icWebsocketConfig,
      ackMessageTimeout: ackMessageTimeoutMs,
    });
    const onMessage = jest.fn();
    const onError = jest.fn();
    const onClose = jest.fn();
    const icWs = new IcWebSocket(wsGatewayAddress, undefined, icWsConfig);
    expect(icWs).toBeDefined();
    icWs.onmessage = onMessage;
    icWs.onerror = onError;
    icWs.onclose = onClose;
    await mockWsServer.connected;

    // wait for the open message from the client
    await mockWsServer.nextMessage;

    const originalClientKey = { ...icWs["_clientKey"] };
    // workaround to simulate the client identity
    icWs["_clientKey"] = client1Key;
    // send the open confirmation message from the canister
    mockWsServer.send(Cbor.encode(VALID_OPEN_MESSAGE));
    await sleep(100);
    // set the client key back
    icWs["_clientKey"] = originalClientKey;

    // send a random application message
    icWs.send({ text: "test" });

    // wait for the second message from the client
    await mockWsServer.nextMessage;

    // send the ack message from the canister
    mockWsServer.send(Cbor.encode(VALID_ACK_MESSAGE));

    // wait until the keep alive message is received by the canister
    const keepAliveMessageBytes = await mockWsServer.nextMessage as ArrayBuffer;
    // reconstruct the message that the client should send
    const clientKey = icWs["_clientKey"];
    const { envelope: { content: envelopeContent } }: WsAgentRequestMessage<CallRequest> = Cbor.decode(keepAliveMessageBytes);

    expect(canisterId.compareTo(
      Principal.fromUint8Array(new Uint8Array(envelopeContent.canister_id as unknown as Uint8Array))
    )).toEqual("eq");
    expect(clientKey.client_principal.compareTo(
      Principal.fromUint8Array(new Uint8Array(envelopeContent.sender as Uint8Array))
    )).toEqual("eq");
    expect(envelopeContent.method_name).toEqual("ws_message");
    const wsMessageArguments = IDL.decode(wsMessageIdl.argTypes, envelopeContent.arg)[0] as unknown as CanisterWsMessageArguments;
    expect(wsMessageArguments).toMatchObject<CanisterWsMessageArguments>({
      msg: {
        client_key: originalClientKey,
        content: expect.any(Uint8Array), // tested below
        is_service_message: true,
        sequence_num: BigInt(2),
        timestamp: expect.any(BigInt),
      }
    });

    const websocketMessageContent = decodeWebsocketServiceMessageContent(wsMessageArguments.msg.content as Uint8Array);
    expect(websocketMessageContent).toMatchObject<WebsocketServiceMessageContent>({
      KeepAliveMessage: {
        last_incoming_sequence_num: BigInt(2),
      },
    });
  });
});
