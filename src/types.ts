import { ActorMethod } from "@dfinity/agent";
import { Principal } from "@dfinity/principal";

export type GetInnerType<S> = S extends ActorMethod<infer T> ? T : never;

export type ClientIncomingMessage = {
  key: string;
  content: Uint8Array;
  cert: Uint8Array;
  tree: Uint8Array;
};
export const isClientIncomingMessage = (arg: unknown): arg is ClientIncomingMessage => {
  return (
    arg instanceof Object &&
    typeof (arg as ClientIncomingMessage).key === "string" &&
    (arg as ClientIncomingMessage).content instanceof Uint8Array &&
    (arg as ClientIncomingMessage).cert instanceof Uint8Array &&
    (arg as ClientIncomingMessage).tree instanceof Uint8Array
  );
};

const isPrincipal = (arg: unknown): arg is Principal => {
  // the Principal.from method doesn't throw if the argument is a string,
  // but in our case it must already be a Principal instance
  // see https://github.com/dfinity/agent-js/blob/349598672c50d738100d123a43f5d1c8fac77854/packages/principal/src/index.ts#L39-L53
  if (typeof arg === "string") {
    return false;
  }

  try {
    Principal.from(arg);
  } catch (e) {
    console.error("isPrincipal", e);
    return false;
  }

  return true;
};

export type GatewayHandshakeMessage = {
  gateway_principal: Principal | Uint8Array;
};
export const isGatewayHandshakeMessage = (arg: unknown): arg is GatewayHandshakeMessage => {
  return (
    arg instanceof Object &&
    isPrincipal((arg as GatewayHandshakeMessage).gateway_principal)
  );
};
