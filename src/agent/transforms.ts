import { WsAgentRequest, WsAgentRequestTransformFn } from './types';
import { Endpoint, Nonce, makeNonce } from '@dfinity/agent';

/**
 * Create a Nonce transform, which takes a function that returns a Buffer, and adds it
 * as the nonce to every call requests.
 * @param nonceFn A function that returns a buffer. By default uses a semi-random method.
 */
export function makeWsNonceTransform(nonceFn: () => Nonce = makeNonce): WsAgentRequestTransformFn {
  return async (request: WsAgentRequest) => {
    // Nonce only needs to be inserted into the body for async calls, to prevent replay attacks.
    if (request.endpoint === Endpoint.Call) {
      request.message.nonce = nonceFn();
    }
  };
}
