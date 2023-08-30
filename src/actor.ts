import { Actor, WsAgent } from "@dfinity/agent";
import { Principal } from "@dfinity/principal";
import { _WS_CANISTER_SERVICE, wsIdlFactory } from "./idl";

type ActorOptions = {
  agent: WsAgent;
};

export const createWsActor = (canisterId: Principal, options: ActorOptions) => {
  // Creates an actor with using the candid interface and the WsAgent
  return Actor.createActor<_WS_CANISTER_SERVICE>(wsIdlFactory, {
    agent: options.agent,
    canisterId,
  });
};
