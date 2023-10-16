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
