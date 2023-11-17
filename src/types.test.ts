import { Principal } from "@dfinity/principal";
import { isClientIncomingMessage, isGatewayHandshakeMessage } from "./types";

describe("isClientIncomingMessage", () => {
  it("should return false for wrong type", () => {
    const incomingMessageWrongType = "not a ClientIncomingMessage";
    expect(isClientIncomingMessage(incomingMessageWrongType)).toBe(false);
  })

  it("should return false for wrong properties", () => {
    const incomingMessageWrongKey = {
      key: {},
      content: new Uint8Array(),
      cert: new Uint8Array(),
      tree: new Uint8Array()
    };
    const incomingMessageWrongContent = {
      key: "key",
      content: "not a Uint8Array",
      cert: new Uint8Array(),
      tree: new Uint8Array()
    };
    const incomingMessageWrongCert = {
      key: "key",
      content: new Uint8Array(),
      cert: "not a Uint8Array",
      tree: new Uint8Array()
    };
    const incomingMessageWrongTree = {
      key: "key",
      content: new Uint8Array(),
      cert: new Uint8Array(),
      tree: "not a Uint8Array"
    }

    expect(isClientIncomingMessage(incomingMessageWrongKey)).toBe(false);
    expect(isClientIncomingMessage(incomingMessageWrongContent)).toBe(false);
    expect(isClientIncomingMessage(incomingMessageWrongCert)).toBe(false);
    expect(isClientIncomingMessage(incomingMessageWrongTree)).toBe(false);
  })

  it("should return true for valid client incoming message", () => {
    const incomingMessage = {
      key: "key",
      content: new Uint8Array(),
      cert: new Uint8Array(),
      tree: new Uint8Array()
    };

    expect(isClientIncomingMessage(incomingMessage)).toBe(true);
  });
});

describe("isGatewayHandshakeMessage", () => {
  it("should return false for wrong type", () => {
    const handshakeMessageWrongType = "not a HandshakeMessage";

    expect(isGatewayHandshakeMessage(handshakeMessageWrongType)).toBe(false);
  });

  it("should return false for wrong properties", () => {
    const handshakeMessageWrongGatewayPrincipal1 = {
      gateway_principal: {},
    };
    const handshakeMessageWrongGatewayPrincipal2 = {
      gateway_principal: "",
    };
    const handshakeMessageWrongGatewayPrincipal3 = {
      gateway_principal: null,
    };

    expect(isGatewayHandshakeMessage(handshakeMessageWrongGatewayPrincipal1)).toBe(false);
    expect(isGatewayHandshakeMessage(handshakeMessageWrongGatewayPrincipal2)).toBe(false);
    expect(isGatewayHandshakeMessage(handshakeMessageWrongGatewayPrincipal3)).toBe(false);
  });

  it("should return true for valid handshake message", () => {
    const message = {
      gateway_principal: Principal.fromText("pmisz-prtlk-b6oe6-bj4fl-6l5fy-h7c2h-so6i7-jiz2h-bgto7-piqfr-7ae"), // a random but valid principal
    };
    const message2 = {
      gateway_principal: Principal.fromText("pmisz-prtlk-b6oe6-bj4fl-6l5fy-h7c2h-so6i7-jiz2h-bgto7-piqfr-7ae").toUint8Array(),
    };

    expect(isGatewayHandshakeMessage(message)).toBe(true);
    expect(isGatewayHandshakeMessage(message2)).toBe(true);
  });
});
