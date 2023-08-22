import { IDL } from "@dfinity/candid";
import type { ClientOpenMessage, ClientIncomingMessage } from "./types";

export const ClientOpenMessageIdl = IDL.Record({
  'content': IDL.Vec(IDL.Nat8),
  'sig': IDL.Vec(IDL.Nat8),
});

export const ClientIncomingMessageIdl = IDL.Record({
  'key': IDL.Text,
  'content': IDL.Vec(IDL.Nat8),
  'cert': IDL.Vec(IDL.Nat8),
  'tree': IDL.Vec(IDL.Nat8),
});

export const serializeClientOpenMessage = (message: ClientOpenMessage): Uint8Array => {
  const encoded = IDL.encode([ClientOpenMessageIdl], [message]);
  return new Uint8Array(encoded);
};

export const deserializeClientIncomingMessage = (data: Uint8Array): ClientIncomingMessage => {
  return IDL.decode([ClientIncomingMessageIdl], data)[0] as unknown as ClientIncomingMessage;
};
