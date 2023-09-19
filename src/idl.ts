import { IDL } from "@dfinity/candid";
import type { Principal } from '@dfinity/principal';
import type { ActorMethod } from '@dfinity/agent';

export type ClientPrincipal = Principal;
export interface WebsocketMessage {
  'sequence_num': bigint,
  'content': Uint8Array | number[],
  'client_principal': ClientPrincipal,
  'timestamp': bigint,
  'is_service_message': boolean,
}
export interface CanisterWsMessageArguments { 'msg': WebsocketMessage }
export type CanisterWsMessageResult = { 'Ok': null } |
{ 'Err': string };
export type CanisterWsOpenArguments = null;
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

const WebsocketMessageIdl = IDL.Record({
  'sequence_num': IDL.Nat64,
  'content': IDL.Vec(IDL.Nat8),
  'client_principal': ClientPrincipalIdl,
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
  'client_principal': ClientPrincipal,
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
  'client_principal': ClientPrincipalIdl,
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
