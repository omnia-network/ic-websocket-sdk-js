import { IDL } from "@dfinity/candid";
import type { ClientOpenMessage, ClientIncomingMessage, WebsocketMessage } from "./types";

export const ClientOpenMessageContentIdl = IDL.Record({
  'client_key': IDL.Vec(IDL.Nat8),
  'canister_id': IDL.Principal,
});

export const ClientOpenMessageIdl = IDL.Record({
  'content': IDL.Vec(IDL.Nat8),
  'sig': IDL.Vec(IDL.Nat8),
});

export const ClientIncomingMessageIdl = IDL.Record({
  key: IDL.Text,
  content: IDL.Vec(IDL.Nat8),
  cert: IDL.Vec(IDL.Nat8),
  tree: IDL.Vec(IDL.Nat8),
});

export const WebsocketMessageIdl = IDL.Record({
  'client_key': IDL.Vec(IDL.Nat8),
  'sequence_num': IDL.Nat64,
  'timestamp': IDL.Nat64,
  'message': IDL.Vec(IDL.Nat8),
});


export const serializeClientOpenMessage = (message: ClientOpenMessage): ArrayBuffer => {
  return IDL.encode([ClientOpenMessageIdl], [message]);
};

export const deserializeClientIncomingMessage = (data: ArrayBuffer): ClientIncomingMessage => {
  return IDL.decode([ClientIncomingMessageIdl], data)[0] as unknown as ClientIncomingMessage;
};

export const deserializeWebsocketMessage = (data: ArrayBuffer): WebsocketMessage => {
  return IDL.decode([WebsocketMessageIdl], data)[0] as unknown as WebsocketMessage;
};
