import { fromHex } from "@dfinity/agent";
import { deserializeClientIncomingMessage, serializeClientOpenMessage } from "./idl";
import type { ClientIncomingMessage, ClientOpenMessage, WebsocketMessage } from "./types";

// candid is not deterministic, so these tests might fail in future versions
// see https://mmapped.blog/posts/20-candid-for-engineers#faq-deterministic

describe("Candid IDL utils", () => {
  it("should serialize the ClientOpenMessage", () => {
    // dumb message, just to test the serialization
    const message: ClientOpenMessage = {
      content: new Uint8Array([1, 2, 3]),
      sig: new Uint8Array([4, 5, 6]),
    };

    const res = serializeClientOpenMessage(message);
    expect(Buffer.from(res).toString("hex"))
      .toEqual("4449444c026d7b6c0291bede0200b99adecb010001010304050603010203");
  });

  it("should deserialize the ClientIncomingMessage", () => {
    // dumb serialized message, just to test the deserialization
    const buf = fromHex("4449444c026d7b6c049f93c60271b99adecb0100e4cdf48d0400deb28ee804000101036b6579030405060301020303070809");

    const res = deserializeClientIncomingMessage(new Uint8Array(buf));
    expect(res).toMatchObject<ClientIncomingMessage>({
      key: "key",
      content: new Uint8Array([4, 5, 6]),
      cert: new Uint8Array([1, 2, 3]),
      tree: new Uint8Array([7, 8, 9]),
    });
  });
});
