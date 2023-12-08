import WsMockServer from "jest-websocket-mock";
import { rest } from "msw";
import { setupServer } from "msw/node";
import { CallRequest, Cbor, fromHex } from "@dfinity/agent";
import { IDL } from "@dfinity/candid";

import IcWebSocket, { MAX_ALLOWED_NETWORK_LATENCY_MS, createWsConfig } from "./ic-websocket";
import { Principal } from "@dfinity/principal";
import { generateRandomIdentity } from "./identity";
import { CanisterWsMessageArguments, CanisterWsOpenArguments, ClientKey, WebsocketServiceMessageContent, _WS_CANISTER_SERVICE, decodeWebsocketServiceMessageContent, isClientKeyEq, wsMessageIdl, wsOpenIdl } from "./idl";
import { canisterId, client1Key } from "./test/clients";
import { INVALID_HANDSHAKE_MESSAGE_FROM_GATEWAY, INVALID_MESSAGE_KEY, VALID_ACK_MESSAGE, VALID_HANDSHAKE_MESSAGE_FROM_GATEWAY, VALID_MESSAGE_SEQ_NUM_2, VALID_MESSAGE_SEQ_NUM_3, VALID_OPEN_MESSAGE, encodeHandshakeMessage } from "./test/messages";
import { flushPromises, sleep } from "./test/helpers";
import { getTestCanisterActor, getTestCanisterActorWithoutMethods, getTestCanisterActorWrongArgs, getTestCanisterActorWrongOpt } from "./test/actor";
import type { WsAgentRequestMessage } from "./agent/types";
import { GATEWAY_PRINCIPAL } from "./test/constants";
import { GatewayHandshakeMessage } from "./types";

const wsGatewayAddress = "ws://127.0.0.1:8080";
// the canister from which the application message was sent (needed to verify the message certificate)
const icNetworkUrl = "http://127.0.0.1:8081";

const testCanisterActor = getTestCanisterActor(canisterId);

const icWebsocketConfig = createWsConfig({
  canisterId: canisterId.toText(),
  canisterActor: testCanisterActor,
  networkUrl: icNetworkUrl,
  identity: generateRandomIdentity(),
  maxCertificateAgeInMinutes: 60 * 24 * 365, // 1 year. Since we're using pre-generated certificates, we need to set it really far in the future
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

const sendHandshakeMessage = async (message: GatewayHandshakeMessage) => {
  mockWsServer.send(encodeHandshakeMessage(message));
  await sleep(100);
};

describe("IcWebsocket class", () => {
  beforeEach(() => {
    mockWsServer = new WsMockServer(wsGatewayAddress);
  });

  afterEach(() => {
    jest.useRealTimers();
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

  it("throws an error if the canisterId is not provided or invalid", () => {
    let icWsConfig = createWsConfig({ ...icWebsocketConfig });
    // @ts-ignore
    delete icWsConfig.canisterId;
    expect(() => new IcWebSocket(wsGatewayAddress, undefined, icWsConfig)).toThrowError();

    icWsConfig = createWsConfig({ ...icWebsocketConfig });
    icWsConfig.canisterId = "invalid";
    expect(() => new IcWebSocket(wsGatewayAddress, undefined, icWsConfig)).toThrowError();
  });

  it("passes if the canisterId is a valid string or principal", () => {
    let icWsConfig = createWsConfig({ ...icWebsocketConfig });
    expect(() => new IcWebSocket(wsGatewayAddress, undefined, icWsConfig)).not.toThrowError();

    icWsConfig = createWsConfig({ ...icWebsocketConfig });
    icWsConfig.canisterId = canisterId;
    expect(() => new IcWebSocket(wsGatewayAddress, undefined, icWsConfig)).not.toThrowError();
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

    const icWsConfig2 = createWsConfig({ ...icWebsocketConfig });
    // @ts-ignore
    icWsConfig2.identity = Promise.resolve({});
    expect(() => new IcWebSocket(wsGatewayAddress, undefined, icWsConfig)).toThrowError("Identity must be a SignIdentity");

    const icWsConfig3 = createWsConfig({ ...icWebsocketConfig });
    // @ts-ignore
    icWsConfig3.identity = Promise.resolve(generateRandomIdentity());
    expect(() => new IcWebSocket(wsGatewayAddress, undefined, icWsConfig)).toThrowError("Identity must be a SignIdentity");
  });

  it("passes if the identity is a SignIdentity", () => {
    const icWsConfig = createWsConfig({ ...icWebsocketConfig });
    expect(() => new IcWebSocket(wsGatewayAddress, undefined, icWsConfig)).not.toThrowError();
  });

  it("throws an error if the networkUrl is not provided", () => {
    const icWsConfig = createWsConfig({ ...icWebsocketConfig });
    // @ts-ignore
    delete icWsConfig.networkUrl;

    expect(() => new IcWebSocket(wsGatewayAddress, undefined, icWsConfig)).toThrowError("Network url is required");
  });

  it("creates a new client key correctly", () => {
    const icWs = new IcWebSocket(wsGatewayAddress, undefined, icWebsocketConfig);
    expect(icWs["_clientKey"]).toMatchObject<ClientKey>({
      client_principal: icWebsocketConfig.identity.getPrincipal(),
      client_nonce: expect.any(BigInt),
    });
  });

  it("getPrincipal returns the correct principal", () => {
    const icWs = new IcWebSocket(wsGatewayAddress, undefined, icWebsocketConfig);
    expect(icWs.getPrincipal().compareTo(icWebsocketConfig.identity.getPrincipal())).toEqual("eq");
  });

  it("throws an error if the handshake message is wrong", async () => {
    const onOpen = jest.fn();
    const onError = jest.fn();
    const icWs = new IcWebSocket(wsGatewayAddress, undefined, icWebsocketConfig);
    expect(icWs).toBeDefined();
    icWs.onopen = onOpen;
    icWs.onerror = onError;
    await mockWsServer.connected;

    await sendHandshakeMessage(INVALID_HANDSHAKE_MESSAGE_FROM_GATEWAY);

    expect(onOpen).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalled();
    expect(icWs["_isHandshakeCompleted"]).toEqual(false);
    expect(icWs["_gatewayPrincipal"]).toBeNull();
    expect(icWs["_isConnectionEstablished"]).toEqual(false);
  });

  it("completes the handshake with a valid handshake message", async () => {
    const onOpen = jest.fn();
    const onError = jest.fn();
    const icWs = new IcWebSocket(wsGatewayAddress, undefined, icWebsocketConfig);
    expect(icWs).toBeDefined();
    icWs.onopen = onOpen;
    icWs.onerror = onError;
    await mockWsServer.connected;

    await sendHandshakeMessage(VALID_HANDSHAKE_MESSAGE_FROM_GATEWAY);

    expect(onOpen).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(icWs["_isHandshakeCompleted"]).toEqual(true);
    expect(icWs["_gatewayPrincipal"]).toEqual(GATEWAY_PRINCIPAL);
    expect(icWs["_isConnectionEstablished"]).toEqual(false);
  });

  it("closes the connection if the open message is not received in time", async () => {
    const onOpen = jest.fn();
    const onError = jest.fn();
    const onClose = jest.fn();
    const icWs = new IcWebSocket(wsGatewayAddress, undefined, icWebsocketConfig);
    expect(icWs).toBeDefined();
    icWs.onopen = onOpen;
    icWs.onerror = onError;
    icWs.onclose = onClose;
    await mockWsServer.connected;

    jest.useFakeTimers();
    mockWsServer.send(encodeHandshakeMessage(VALID_HANDSHAKE_MESSAGE_FROM_GATEWAY));

    // advance the open timeout
    await jest.advanceTimersByTimeAsync(2 * MAX_ALLOWED_NETWORK_LATENCY_MS);

    expect(icWs["_isConnectionEstablished"]).toEqual(false);
    expect(onOpen).not.toHaveBeenCalled();
    const openError = new Error("Open timeout expired before receiving the open message");
    expect(onError).toHaveBeenCalledWith(new ErrorEvent("error", { error: openError }));

    await jest.runAllTimersAsync();
    await expect(mockWsServer.closed).resolves.not.toThrow();
    expect(onClose).toHaveBeenCalled();
    expect(icWs.readyState).toEqual(WebSocket.CLOSED);
  });

  it("creates a new instance and sends the open message", async () => {
    const icWs = new IcWebSocket(wsGatewayAddress, undefined, icWebsocketConfig);
    expect(icWs).toBeDefined();
    await mockWsServer.connected;
    await sendHandshakeMessage(VALID_HANDSHAKE_MESSAGE_FROM_GATEWAY);

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
      gateway_principal: GATEWAY_PRINCIPAL,
    });
  });

  it("onopen is called when open message from canister is received", async () => {
    const onOpen = jest.fn();
    const onMessage = jest.fn();
    const onError = jest.fn();
    const icWs = new IcWebSocket(wsGatewayAddress, undefined, icWebsocketConfig);
    expect(icWs).toBeDefined();
    // workaround: simulate the client identity
    icWs["_clientKey"] = client1Key;
    icWs.onopen = onOpen;
    icWs.onmessage = onMessage;
    icWs.onerror = onError;
    await mockWsServer.connected;

    jest.useFakeTimers();
    mockWsServer.send(encodeHandshakeMessage(VALID_HANDSHAKE_MESSAGE_FROM_GATEWAY));

    expect(onOpen).not.toHaveBeenCalled();
    expect(icWs["_isConnectionEstablished"]).toEqual(false);
    expect(onError).not.toHaveBeenCalled();
    expect(onMessage).not.toHaveBeenCalled();

    // wait for the open message from the client
    await jest.advanceTimersToNextTimerAsync(); // needed just to advance the mockWsServer timeouts
    await mockWsServer.nextMessage;

    // send the open confirmation message from the canister
    mockWsServer.send(Cbor.encode(VALID_OPEN_MESSAGE));

    // advance the open timeout so that it expires
    await flushPromises(); // make the message processing happen
    await jest.advanceTimersByTimeAsync(2 * MAX_ALLOWED_NETWORK_LATENCY_MS);

    expect(onOpen).toHaveBeenCalled();
    expect(icWs["_isConnectionEstablished"]).toEqual(true);
    expect(onError).not.toHaveBeenCalled();
    expect(icWs.readyState).toEqual(WebSocket.OPEN);
    // make sure onmessage callback is not called when receiving the first message
    expect(onMessage).not.toHaveBeenCalled();
  });

  it("onmessage is called when a valid message is received", async () => {
    const onMessage = jest.fn();
    const onError = jest.fn();
    const icWs = new IcWebSocket(wsGatewayAddress, undefined, icWebsocketConfig);
    expect(icWs).toBeDefined();
    // workaround: simulate the client identity
    icWs["_clientKey"] = client1Key;
    icWs.onmessage = onMessage;
    icWs.onerror = onError;
    await mockWsServer.connected;
    await sendHandshakeMessage(VALID_HANDSHAKE_MESSAGE_FROM_GATEWAY);

    // send the open confirmation message from the canister
    mockWsServer.send(Cbor.encode(VALID_OPEN_MESSAGE));
    await sleep(100);

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
    // workaround: simulate the client identity
    icWs["_clientKey"] = client1Key;
    icWs.onmessage = onMessage;
    icWs.onerror = onError;
    icWs.onclose = onClose;
    await mockWsServer.connected;
    await sendHandshakeMessage(VALID_HANDSHAKE_MESSAGE_FROM_GATEWAY);

    // send the open confirmation message from the canister
    mockWsServer.send(Cbor.encode(VALID_OPEN_MESSAGE));
    await sleep(100);

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
    // workaround: simulate the client identity
    icWs["_clientKey"] = client1Key;
    icWs.onmessage = onMessage;
    icWs.onerror = onError;
    icWs.onclose = onClose;
    await mockWsServer.connected;
    await sendHandshakeMessage(VALID_HANDSHAKE_MESSAGE_FROM_GATEWAY);

    // send the open confirmation message from the canister
    mockWsServer.send(Cbor.encode(VALID_OPEN_MESSAGE));
    await sleep(100);

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
    await sendHandshakeMessage(VALID_HANDSHAKE_MESSAGE_FROM_GATEWAY);

    expect(() => icWs.send({ text: "test" })).toThrowError("Connection is not established yet");
  });

  it("messages are sent if the connection is established", async () => {
    const icWs = new IcWebSocket(wsGatewayAddress, undefined, icWebsocketConfig);
    expect(icWs).toBeDefined();
    await mockWsServer.connected;
    await sendHandshakeMessage(VALID_HANDSHAKE_MESSAGE_FROM_GATEWAY);

    // wait for the open message from the client
    await mockWsServer.nextMessage;

    // we can't use the same worksaround as in the previous tests
    // because here we need to check the message sent to the canister,
    // which needs a real signature
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
    jest.useRealTimers();
    mockWsServer.close();
  });

  it("fails if messages are never acknowledged", async () => {
    const ackMessageIntervalMs = 2000;
    const icWsConfig = createWsConfig({
      ...icWebsocketConfig,
      ackMessageIntervalMs,
    });
    const onError = jest.fn();
    const onClose = jest.fn();

    const icWs = new IcWebSocket(wsGatewayAddress, undefined, icWsConfig);
    expect(icWs).toBeDefined();
    // workaround: simulate the client identity
    icWs["_clientKey"] = client1Key;
    icWs.onerror = onError;
    icWs.onclose = onClose;
    await mockWsServer.connected;
    await sendHandshakeMessage(VALID_HANDSHAKE_MESSAGE_FROM_GATEWAY);

    // wait for the ws_open message from the client
    await mockWsServer.nextMessage;
    // send the open message to the client
    mockWsServer.send(Cbor.encode(VALID_OPEN_MESSAGE));

    // workaround: wait 100ms to make sure that
    // the client processes the open message
    await sleep(100);

    // when the client sends a message, it makes the ack timeout start,
    // so here we have to mock the timers
    jest.useFakeTimers();

    // send a random application message from the client,
    // so that the ack timeout starts 
    icWs.send({ text: "test" });

    // wait for the second message from the client
    await jest.advanceTimersToNextTimerAsync(); // needed just to advance the mockWsServer timeouts
    await mockWsServer.nextMessage;

    // make the ack timeout expire
    await jest.advanceTimersByTimeAsync(ackMessageIntervalMs + MAX_ALLOWED_NETWORK_LATENCY_MS);

    const ackTimeoutError = new Error(`Ack message timeout. Not received ack for sequence numbers: ${[BigInt(1)]}`);
    expect(onError).toHaveBeenCalledWith(new ErrorEvent("error", { error: ackTimeoutError }));
    expect(onClose).toHaveBeenCalled();
  });

  it("fails if messages are not acknowledged in time", async () => {
    const ackMessageIntervalMs = 2000;
    const icWsConfig = createWsConfig({
      ...icWebsocketConfig,
      ackMessageIntervalMs,
    });
    const onError = jest.fn();
    const onClose = jest.fn();

    const icWs = new IcWebSocket(wsGatewayAddress, undefined, icWsConfig);
    expect(icWs).toBeDefined();
    // workaround: simulate the client identity
    icWs["_clientKey"] = client1Key;
    icWs.onerror = onError;
    icWs.onclose = onClose;
    await mockWsServer.connected;
    await sendHandshakeMessage(VALID_HANDSHAKE_MESSAGE_FROM_GATEWAY);

    // wait for the ws_open message from the client
    await mockWsServer.nextMessage;
    // send the open message to the client
    mockWsServer.send(Cbor.encode(VALID_OPEN_MESSAGE));

    // workaround: wait 100ms to make sure that
    // the client processes the open message
    await sleep(100);

    // when the client sends a message, it makes the ack timeout start,
    // so here we have to mock the timers
    jest.useFakeTimers();

    // send a random application message from the client,
    // so that the ack timeout starts 
    icWs.send({ text: "test" });

    // wait for the second message from the client
    await jest.advanceTimersToNextTimerAsync(); // needed just to advance the mockWsServer timeouts
    await mockWsServer.nextMessage;

    // make the ack timeout expire
    await jest.advanceTimersByTimeAsync(ackMessageIntervalMs + MAX_ALLOWED_NETWORK_LATENCY_MS);

    // send the ack message from the canister
    // when the ack timeout is already expired
    mockWsServer.send(Cbor.encode(VALID_ACK_MESSAGE));

    const ackTimeoutError = new Error(`Ack message timeout. Not received ack for sequence numbers: ${[BigInt(1)]}`);
    expect(onError).toHaveBeenCalledWith(new ErrorEvent("error", { error: ackTimeoutError }));
    expect(onClose).toHaveBeenCalled();
  });

  it("acknowledges messages", async () => {
    const ackMessageIntervalMs = 2000;
    const icWsConfig = createWsConfig({
      ...icWebsocketConfig,
      ackMessageIntervalMs,
    });
    const onMessage = jest.fn();
    const onError = jest.fn();
    const onClose = jest.fn();
    const icWs = new IcWebSocket(wsGatewayAddress, undefined, icWsConfig);
    expect(icWs).toBeDefined();
    // workaround: simulate the client identity
    icWs["_clientKey"] = client1Key;
    icWs.onmessage = onMessage;
    icWs.onerror = onError;
    icWs.onclose = onClose;
    await mockWsServer.connected;
    await sendHandshakeMessage(VALID_HANDSHAKE_MESSAGE_FROM_GATEWAY);

    // wait for the ws_open message from the client
    await mockWsServer.nextMessage;
    // send the open message to the client
    mockWsServer.send(Cbor.encode(VALID_OPEN_MESSAGE));

    // workaround: wait 100ms to make sure that
    // the client processes the open message
    await sleep(100);

    // when the client sends a message, it makes the ack timeout start,
    // so here we have to mock the timers
    jest.useFakeTimers();

    // send a random application message
    // so that the ack timeout starts
    icWs.send({ text: "test" });

    // wait for the second message from the client
    await jest.advanceTimersToNextTimerAsync(); // needed just to advance the mockWsServer timeouts
    await mockWsServer.nextMessage;

    // send the ack message from the canister
    mockWsServer.send(Cbor.encode(VALID_ACK_MESSAGE));

    console.log("sent ack message from canister");

    // make the ack timeout expire
    await jest.advanceTimersByTimeAsync(ackMessageIntervalMs + MAX_ALLOWED_NETWORK_LATENCY_MS);

    // first message has been acknowledged correctly,
    // as the error only reports the missing ack for the keep alive response
    const ackTimeoutError = new Error(`Ack message timeout. Not received ack for sequence numbers: ${[BigInt(2)]}`);
    expect(onError).toHaveBeenCalledWith(new ErrorEvent("error", { error: ackTimeoutError }));
    expect(onClose).not.toHaveBeenCalled();
    // make sure onmessage is not called for service messages
    expect(onMessage).not.toHaveBeenCalled();
  });

  it("send an ack message after receiving the ack", async () => {
    const ackMessageIntervalMs = 2000;
    const icWsConfig = createWsConfig({
      ...icWebsocketConfig,
      ackMessageIntervalMs,
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
    await sendHandshakeMessage(VALID_HANDSHAKE_MESSAGE_FROM_GATEWAY);

    // wait for the open message from the client
    await mockWsServer.nextMessage;

    // we can't use the same worksaround as in the previous tests
    // because here we need to check the message sent to the canister,
    // which needs a real signature
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
