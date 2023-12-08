export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function flushPromises(): Promise<void> {
  return new Promise(jest.requireActual("timers").setImmediate);
};
