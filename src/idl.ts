import { IDL } from "@dfinity/candid";
import type { Principal } from '@dfinity/principal';
import type { ActorMethod } from '@dfinity/agent';

export type ClientPrincipal = Principal;
export interface WebsocketMessage {
  'sequence_num' : bigint,
  'content' : Uint8Array | number[],
  'client_principal' : ClientPrincipal,
  'timestamp' : bigint,
}
export interface CanisterWsMessageArguments { 'msg' : WebsocketMessage }
export type CanisterWsMessageResult = { 'Ok' : null } |
  { 'Err' : string };
export interface CanisterWsOpenArguments { 'is_anonymous' : boolean }
export interface CanisterWsOpenResultValue {
  'client_principal' : ClientPrincipal,
  'nonce' : bigint,
}
export type CanisterWsOpenResult = { 'Ok' : CanisterWsOpenResultValue } |
  { 'Err' : string };
export interface _WS_CANISTER_SERVICE {
  'ws_message' : ActorMethod<
    [CanisterWsMessageArguments],
    CanisterWsMessageResult
  >,
  'ws_open' : ActorMethod<[CanisterWsOpenArguments], CanisterWsOpenResult>,
}

export const wsIdlFactory = () => {
  const ClientPrincipal = IDL.Principal;
  const WebsocketMessage = IDL.Record({
    'sequence_num' : IDL.Nat64,
    'content' : IDL.Vec(IDL.Nat8),
    'client_principal' : ClientPrincipal,
    'timestamp' : IDL.Nat64,
  });
  const CanisterWsMessageArguments = IDL.Record({ 'msg' : WebsocketMessage });
  const CanisterWsMessageResult = IDL.Variant({
    'Ok' : IDL.Null,
    'Err' : IDL.Text,
  });
  const CanisterWsOpenArguments = IDL.Record({ 'is_anonymous' : IDL.Bool });
  const CanisterWsOpenResultValue = IDL.Record({
    'client_principal' : ClientPrincipal,
    'nonce' : IDL.Nat64,
  });
  const CanisterWsOpenResult = IDL.Variant({
    'Ok' : CanisterWsOpenResultValue,
    'Err' : IDL.Text,
  });
  return IDL.Service({
    'ws_message' : IDL.Func(
        [CanisterWsMessageArguments],
        [CanisterWsMessageResult],
        [],
      ),
    'ws_open' : IDL.Func([CanisterWsOpenArguments], [CanisterWsOpenResult], []),
  });
};
