import { IDL } from "@dfinity/candid";
import { Principal } from "@dfinity/principal";
import { _WS_CANISTER_SERVICE, wsMessageIdl, wsOpenIdl } from "./idl";
import type { CanisterWsMessageArguments, CanisterWsOpenArguments } from "./idl";
import { WsAgent } from "./agent";

const _callCanisterMethod = async (
  canisterId: Principal,
  agent: WsAgent,
  methodName: string,
  idlFunc: IDL.FuncClass,
  args: unknown[],
): Promise<void> => {
  const cid = Principal.from(canisterId);
  const arg = IDL.encode(idlFunc.argTypes, args);

  return agent.call(cid, {
    methodName,
    arg,
    effectiveCanisterId: cid,
  });
};

/**
 * Calls the ws_open method on the canister.
 */
export const callCanisterWsOpen = async (
  canisterId: Principal,
  agent: WsAgent,
  args: CanisterWsOpenArguments,
): Promise<void> => _callCanisterMethod(canisterId, agent, "ws_open", wsOpenIdl, [args]);

/**
 * Calls the ws_message method on the canister.
 */
export const callCanisterWsMessage = async (
  canisterId: Principal,
  agent: WsAgent,
  args: CanisterWsMessageArguments,
): Promise<void> => _callCanisterMethod(canisterId, agent, "ws_message", wsMessageIdl, [args, []]);
