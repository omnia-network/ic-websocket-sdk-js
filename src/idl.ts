import { IDL } from "@dfinity/candid";
import type { Principal } from '@dfinity/principal';
import type { ActorMethod } from '@dfinity/agent';

export type ClientPrincipal = Principal;
export type ClientKey = {
  'client_principal': ClientPrincipal,
  'client_nonce': bigint,
}
export interface WebsocketMessage {
  'sequence_num': bigint,
  'content': Uint8Array | number[],
  'client_key': ClientKey,
  'timestamp': bigint,
  'is_service_message': boolean,
}
export interface CanisterWsMessageArguments { 'msg': WebsocketMessage }
export type CanisterWsMessageResult = { 'Ok': null } |
{ 'Err': string };
export type CanisterWsOpenArguments = {
  'client_nonce': bigint,
};
export type CanisterWsOpenResult = { 'Ok': null } |
{ 'Err': string };
export interface _WS_CANISTER_SERVICE {
  'ws_message': ActorMethod<
    [CanisterWsMessageArguments],
    CanisterWsMessageResult
  >,
  'ws_open': ActorMethod<[CanisterWsOpenArguments], CanisterWsOpenResult>,
};

export const ClientPrincipalIdl = IDL.Principal;
export const ClientKeyIdl = IDL.Record({
  'client_principal': ClientPrincipalIdl,
  'client_nonce': IDL.Nat64,
});

const WebsocketMessageIdl = IDL.Record({
  'sequence_num': IDL.Nat64,
  'content': IDL.Vec(IDL.Nat8),
  'client_key': ClientKeyIdl,
  'timestamp': IDL.Nat64,
  'is_service_message': IDL.Bool,
});
const CanisterWsMessageArgumentsIdl = IDL.Record({ 'msg': WebsocketMessageIdl });
const CanisterWsMessageResultIdl = IDL.Variant({
  'Ok': IDL.Null,
  'Err': IDL.Text,
});
const CanisterWsOpenArgumentsIdl = IDL.Null;
const CanisterWsOpenResultIdl = IDL.Variant({
  'Ok': IDL.Null,
  'Err': IDL.Text,
});

export const wsOpenIdl = IDL.Func([CanisterWsOpenArgumentsIdl], [CanisterWsOpenResultIdl], []);
export const wsMessageIdl = IDL.Func([CanisterWsMessageArgumentsIdl], [CanisterWsMessageResultIdl], []);

export type CanisterOpenMessageContent = {
  'client_key': ClientKey,
};
export type CanisterAckMessageContent = {
  'last_incoming_sequence_num': bigint,
};
export type ClientKeepAliveMessageContent = {
  'last_incoming_sequence_num': bigint,
};
export type WebsocketServiceMessageContent = {
  OpenMessage: CanisterOpenMessageContent,
} | {
  AckMessage: CanisterAckMessageContent,
} | {
  KeepAliveMessage: ClientKeepAliveMessageContent,
};

export const CanisterOpenMessageContentIdl = IDL.Record({
  'client_key': ClientKeyIdl,
});
export const CanisterAckMessageContentIdl = IDL.Record({
  'last_incoming_sequence_num': IDL.Nat64,
});
export const ClientKeepAliveMessageContentIdl = IDL.Record({
  'last_incoming_sequence_num': IDL.Nat64,
});
export const WebsocketServiceMessageContentIdl = IDL.Variant({
  'OpenMessage': CanisterOpenMessageContentIdl,
  'AckMessage': CanisterAckMessageContentIdl,
  'KeepAliveMessage': ClientKeepAliveMessageContentIdl,
});

export const decodeWebsocketServiceMessageContent = (bytes: Uint8Array): WebsocketServiceMessageContent => {
  const decoded = IDL.decode([WebsocketServiceMessageContentIdl], bytes);
  if (decoded.length !== 1) {
    throw new Error("Invalid CanisterServiceMessage");
  }
  return decoded[0] as unknown as WebsocketServiceMessageContent;
};

export const encodeWebsocketServiceMessageContent = (msg: WebsocketServiceMessageContent): Uint8Array => {
  return new Uint8Array(IDL.encode([WebsocketServiceMessageContentIdl], [msg]));
};

export const isClientKeyEq = (a: ClientKey, b: ClientKey): boolean => {
  return a.client_principal.compareTo(b.client_principal) === "eq" && a.client_nonce === b.client_nonce;
}
