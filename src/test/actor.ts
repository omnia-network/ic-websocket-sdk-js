import { Actor, ActorMethod, ActorSubclass } from "@dfinity/agent";
import { IDL } from "@dfinity/candid";
import { Principal } from "@dfinity/principal";
import {
  CanisterWsMessageArguments,
  CanisterWsMessageArgumentsIdl,
  CanisterWsMessageResult,
  CanisterWsMessageResultIdl,
  CanisterWsOpenArguments,
  CanisterWsOpenResult,
} from "../idl";

const testCanisterIdlFactory: IDL.InterfaceFactory = ({ IDL }) => {
  const AppMessage = IDL.Record({ 'text': IDL.Text });
  return IDL.Service({
    'ws_message': IDL.Func(
      [CanisterWsMessageArgumentsIdl, IDL.Opt(AppMessage)],
      [CanisterWsMessageResultIdl],
      [],
    ),
  });
}

export type AppMessage = { 'text' : string };
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
