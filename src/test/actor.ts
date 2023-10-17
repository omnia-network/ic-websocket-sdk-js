import { Actor, ActorMethod, ActorSubclass } from "@dfinity/agent";
import { IDL } from "@dfinity/candid";
import { Principal } from "@dfinity/principal";

const testCanisterIdlFactory: IDL.InterfaceFactory = ({ IDL }) => {
  const ClientPrincipal = IDL.Principal;
  const ClientKey = IDL.Record({
    'client_principal': ClientPrincipal,
    'client_nonce': IDL.Nat64,
  });
  const WebsocketMessage = IDL.Record({
    'sequence_num': IDL.Nat64,
    'content': IDL.Vec(IDL.Nat8),
    'client_key': ClientKey,
    'timestamp': IDL.Nat64,
    'is_service_message': IDL.Bool,
  });
  const CanisterWsMessageArguments = IDL.Record({ 'msg': WebsocketMessage });
  const AppMessage = IDL.Record({ 'text': IDL.Text });
  const CanisterWsMessageResult = IDL.Variant({
    'Ok': IDL.Null,
    'Err': IDL.Text,
  });
  return IDL.Service({
    'ws_message': IDL.Func(
      [CanisterWsMessageArguments, IDL.Opt(AppMessage)],
      [CanisterWsMessageResult],
      [],
    ),
  });
}

export type AppMessage = { 'text' : string };
export interface CanisterWsMessageArguments { 'msg' : WebsocketMessage }
export type CanisterWsMessageResult = { 'Ok' : null } |
  { 'Err' : string };
export interface ClientKey {
  'client_principal' : ClientPrincipal,
  'client_nonce' : bigint,
}
export type ClientPrincipal = Principal;
export interface WebsocketMessage {
  'sequence_num' : bigint,
  'content' : Uint8Array | number[],
  'client_key' : ClientKey,
  'timestamp' : bigint,
  'is_service_message' : boolean,
}
export type CanisterWsOpenArguments = {
  'client_nonce': bigint,
};
export type CanisterWsOpenResult = { 'Ok': null } |
{ 'Err': string };
export interface _SERVICE {
  'ws_message' : ActorMethod<
    [CanisterWsMessageArguments, [] | [AppMessage]],
    CanisterWsMessageResult
  >,
  'ws_open': ActorMethod<[CanisterWsOpenArguments], CanisterWsOpenResult>,
}

export const getTestCanisterActor = (canisterId: string | Principal): ActorSubclass<_SERVICE> => Actor.createActor(testCanisterIdlFactory, {
  canisterId,
});

export const getTestCanisterActorWithoutMethods = (canisterId: string | Principal): ActorSubclass<_SERVICE> => Actor.createActor(({IDL}) => {
  return IDL.Service({
    'random_method': IDL.Func(
      [IDL.Text],
      [IDL.Text],
      [],
    ),
  });
}, {
  canisterId,
});

export const getTestCanisterActorWrongArgs = (canisterId: string | Principal): ActorSubclass<_SERVICE> => Actor.createActor(({IDL}) => {
  return IDL.Service({
    'ws_message': IDL.Func(
      [IDL.Text],
      [IDL.Text],
      [],
    ),
  });
}, {
  canisterId,
});

export const getTestCanisterActorWrongOpt = (canisterId: string | Principal): ActorSubclass<_SERVICE> => Actor.createActor(({IDL}) => {
  return IDL.Service({
    'ws_message': IDL.Func(
      [IDL.Text, IDL.Text], // the first argument can be anything
      [IDL.Text],
      [],
    ),
  });
}, {
  canisterId,
});
