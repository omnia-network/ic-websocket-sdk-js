import { Principal } from "@dfinity/principal";
import type { ActorMethod } from '@dfinity/agent';

export type ClientPublicKey = Uint8Array | number[];

export type ClientOpenMessageContent = {
  client_key: ClientPublicKey;
  canister_id: Principal;
};

export type ClientOpenMessage = {
  content: Uint8Array;
  sig: Uint8Array;
};

export type ClientIncomingMessage = {
  key: string;
  content: Uint8Array;
  cert: Uint8Array;
  tree: Uint8Array;
}

export type WebsocketMessage = {
  client_key: ClientPublicKey;
  sequence_num: bigint;
  timestamp: bigint;
  message: Uint8Array;
};

// Actor types
export interface RelayedClientMessage {
  'sig': Uint8Array | number[],
  'content': Uint8Array | number[],
}

export interface DirectClientMessage {
  'client_key': ClientPublicKey,
  'message': Uint8Array | number[],
}

export type CanisterIncomingMessage = {
  'IcWebSocketEstablished': ClientPublicKey
} |
{ 'DirectlyFromClient': DirectClientMessage } |
{ 'RelayedByGateway': RelayedClientMessage };

export interface CanisterWsMessageArguments { 'msg': CanisterIncomingMessage }
export type CanisterWsMessageResult = { 'Ok': null } |
{ 'Err': string };

export interface CanisterWsRegisterArguments { 'client_key': ClientPublicKey }
export type CanisterWsRegisterResult = { 'Ok': null } |
{ 'Err': string };

export type ActorService = {
  'ws_message': ActorMethod<
    [CanisterWsMessageArguments],
    CanisterWsMessageResult
  >,
  'ws_register': ActorMethod<
    [CanisterWsRegisterArguments],
    CanisterWsRegisterResult
  >,
};
