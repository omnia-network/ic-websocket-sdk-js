import { RequestId, SubmitResponse, WsAgent, polling } from "@dfinity/agent";
import { IDL } from "@dfinity/candid";
import { Principal } from "@dfinity/principal";
import { _WS_CANISTER_SERVICE, wsMessageIdl, wsOpenIdl } from "./idl";
import type { CanisterWsMessageArguments, CanisterWsOpenArguments, CanisterWsOpenResult } from "./idl";

const _callMethod = async (
  canisterId: Principal,
  agent: WsAgent,
  methodName: string,
  idlFunc: IDL.FuncClass,
  args: unknown[],
): Promise<SubmitResponse> => {
  const cid = Principal.from(canisterId);
  const arg = IDL.encode(idlFunc.argTypes, [args]);

  return agent.call(cid, {
    methodName,
    arg,
    effectiveCanisterId: cid,
  });
};

/**
 * Calls the ws_open method on the canister.
 */
export const callWsOpen = async (
  canisterId: Principal,
  agent: WsAgent,
  args: CanisterWsOpenArguments,
): Promise<SubmitResponse> => _callMethod(canisterId, agent, "ws_open", wsOpenIdl, [args]);

/**
 * Executes a request to the read_state endpoint. 
 * Should only be used when the {@link callWsOpen} returns an error,
 * or when the first message is not sent by the canister before the timeout.
 * 
 * @returns The error message returned by the canister.
 * @throws If the canister doesn't return an error. This means that the gateway didn't relay the ws_open message.
 */
export const pollForWsOpenResponse = async (
  canisterId: Principal,
  agent: WsAgent,
  requestId: RequestId,
): Promise<string> => {
  const responseBytes = await polling.pollForResponse(
    agent,
    canisterId,
    requestId,
    polling.defaultStrategy(),
  );

  if (!responseBytes) {
    throw new Error("No response from the canister");
  }

  const returnValues = IDL.decode(wsOpenIdl.retTypes, Buffer.from(responseBytes));

  if (returnValues.length !== 1) {
    throw new Error("Invalid read_state response");
  }

  const wsOpenResult = returnValues[0] as CanisterWsOpenResult;

  if ("Ok" in wsOpenResult) {
    throw new Error("Gateway didn't relay the ws_open message");
  }

  return wsOpenResult.Err;
};

/**
 * Calls the ws_message method on the canister.
 */
export const callWsMessage = async (
  canisterId: Principal,
  agent: WsAgent,
  args: CanisterWsMessageArguments,
): Promise<SubmitResponse> => _callMethod(canisterId, agent, "ws_message", wsMessageIdl, [args]);
