export type ClientIncomingMessage = {
  key: string;
  content: ArrayBuffer;
  cert: ArrayBuffer;
  tree: ArrayBuffer;
};

export const isClientIncomingMessage = (arg: unknown): arg is ClientIncomingMessage => {
  return (
    arg instanceof Object &&
    typeof (arg as ClientIncomingMessage).key === "string" &&
    (arg as ClientIncomingMessage).content instanceof ArrayBuffer &&
    (arg as ClientIncomingMessage).cert instanceof ArrayBuffer &&
    (arg as ClientIncomingMessage).tree instanceof ArrayBuffer
  );
};
