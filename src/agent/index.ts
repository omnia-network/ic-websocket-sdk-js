import { Principal } from '@dfinity/principal';
import {
  HttpAgent,
  IdentityInvalidError,
  makeNonce,
  requestIdOf,
  SignIdentity,
  Cbor,
  concat,
  Expiry,
  CallRequest,
  Endpoint,
  Envelope,
  SubmitRequestType,
  CanisterStatus,
} from '@dfinity/agent';
import {
  WsAgentRequest,
  WsAgentRequestMessage,
  WsAgentRequestTransformFn,
  WsAgentSubmitRequest,
} from './types';
import { makeWsNonceTransform } from './transforms';

const domainSeparator = new TextEncoder().encode('\x0Aic-request');

// Default delta for ingress expiry is 5 minutes.
const DEFAULT_INGRESS_EXPIRY_DELTA_IN_MSECS = 5 * 60 * 1000;

class DefaultWsError extends Error {
  constructor(public readonly message: string) {
    super(message);
    Object.setPrototypeOf(this, DefaultWsError.prototype);
  }
}

export interface WsAgentOptions {
  // Another WsAgent to inherit configuration of. This
  // is only used at construction.
  source?: WsAgent;

  // Must be an **open** WebSocket instance.
  ws: WebSocket;

  // The http agent needed for the syncTime method.
  httpAgent: HttpAgent;

  // The principal used to send messages. This cannot be empty at the request
  // time (will throw).
  identity: SignIdentity | Promise<SignIdentity>;

  /**
   * Prevents the agent from providing a unique {@link Nonce} with each call.
   * Enabling may cause rate limiting of identical requests
   * at the boundary nodes.
   *
   * To add your own nonce generation logic, you can use the following:
   * @example
   * import {makeNonceTransform, makeNonce} from '@dfinity/agent';
   * const agent = new HttpAgent({ disableNonce: true });
   * agent.addTransform(makeNonceTransform(makeNonce);
   * @default false
   */
  disableNonce?: boolean;
  /**
   * Number of times to retry requests before throwing an error
   * @default 3
   */
  retryTimes?: number;
}

export class WsAgent {
  private readonly _pipeline: WsAgentRequestTransformFn[] = [];
  private _identity: Promise<SignIdentity>;
  private readonly _ws: WebSocket;
  private _timeDiffMsecs = 0;
  private _httpAgent: HttpAgent;
  private readonly _retryTimes; // Retry requests N times before erroring by default
  public readonly _isAgent = true;

  constructor(options: WsAgentOptions) {
    if (options.source) {
      if (!(options.source instanceof WsAgent)) {
        throw new Error("An Agent's source can only be another WsAgent");
      }
      this._pipeline = [...options.source._pipeline];
      this._identity = options.source._identity;
      this._ws = options.source._ws;
      this._httpAgent = options.source._httpAgent;
    } else {
      if (!options.identity) {
        throw new Error('An identity must be provided to the WsAgent');
      }
      this._identity = Promise.resolve(options.identity);
      if (!options.ws) {
        throw new Error('A WebSocket instance must be provided to the WsAgent');
      } else if (options.ws.readyState !== WebSocket.OPEN) {
        throw new DefaultWsError('The provided WebSocket is not open');
      }
      this._ws = options.ws;
      if (!options.httpAgent) {
        throw new Error('An httpAgent must be provided to the WsAgent');
      }
      this._httpAgent = options.httpAgent;
    }
    // Default is 3, only set from option if greater or equal to 0
    this._retryTimes =
      options.retryTimes !== undefined && options.retryTimes >= 0 ? options.retryTimes : 3;

    // Add a nonce transform to ensure calls are unique
    if (!options.disableNonce) {
      this.addTransform(makeWsNonceTransform(makeNonce));
    }
  }

  public addTransform(fn: WsAgentRequestTransformFn, priority = fn.priority || 0): void {
    // Keep the pipeline sorted at all time, by priority.
    const i = this._pipeline.findIndex(x => (x.priority || 0) < priority);
    this._pipeline.splice(i >= 0 ? i : this._pipeline.length, 0, Object.assign(fn, { priority }));
  }

  public async getPrincipal(): Promise<Principal> {
    if (!this._identity) {
      throw new IdentityInvalidError(
        "This identity has expired due this application's security policy. Please refresh your authentication.",
      );
    }
    return (await this._identity).getPrincipal();
  }

  public async call(
    canisterId: Principal | string,
    options: {
      methodName: string;
      arg: ArrayBuffer;
      effectiveCanisterId?: Principal | string;
    },
  ): Promise<void> {
    const id = await this._identity;
    if (!id) {
      throw new IdentityInvalidError(
        "This identity has expired due this application's security policy. Please refresh your authentication.",
      );
    }
    const canister = Principal.from(canisterId);

    const sender: Principal = id.getPrincipal();

    let ingress_expiry = new Expiry(DEFAULT_INGRESS_EXPIRY_DELTA_IN_MSECS);

    // If the value is off by more than 30 seconds, reconcile system time with the network
    if (Math.abs(this._timeDiffMsecs) > 1_000 * 30) {
      ingress_expiry = new Expiry(DEFAULT_INGRESS_EXPIRY_DELTA_IN_MSECS + this._timeDiffMsecs);
    }

    const submit: CallRequest = {
      request_type: SubmitRequestType.Call,
      canister_id: canister,
      method_name: options.methodName,
      arg: options.arg,
      sender,
      ingress_expiry,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const transformedRequest = (await this._transform({
      endpoint: Endpoint.Call,
      message: submit,
    })) as WsAgentSubmitRequest;

    const envelope = await this._signRequest(transformedRequest.message, id);
    const message: WsAgentRequestMessage<CallRequest> = {
      envelope,
      canister_id: canister,
    };

    this._requestAndRetry(message);
  }

  private async _signRequest<T extends Record<string, any>>(
    message: T,
    identity: SignIdentity,
  ): Promise<Envelope<T>> {
    const requestId = requestIdOf(message);
    return {
      content: message,
      sender_pubkey: identity.getPublicKey().toDer(),
      sender_sig: await identity.sign(concat(domainSeparator, requestId)),
    };
  }

  /**
   * Sends a fire-and-forget request body to the WebSocket Gateway.
   * If the request fails, the request 
   */
  private _requestAndRetry<T>(
    message: WsAgentRequestMessage<T>,
    tries = 0,
  ): Promise<void> {
    const messageBytes = Cbor.encode(message);

    try {
      this._ws.send(messageBytes);
    } catch (error) {
      if (this._retryTimes > tries) {
        console.warn(`${error}  Retrying request.`);
        return this._requestAndRetry(message, tries + 1);
      }
    }

    throw new DefaultWsError("Sending the envelope through the WebSocket failed.");
  }

  /**
   * Allows agent to sync its time with the network. Can be called during intialization or mid-lifecycle if the device's clock has drifted away from the network time. This is necessary to set the Expiry for a request
   * @param {Principal} canisterId - Pass a canister ID if you need to sync the time with a particular replica. Uses the management canister by default
   */
  public async syncTime(canisterId?: Principal): Promise<void> {
    const callTime = Date.now();
    try {
      if (!canisterId) {
        console.log(
          'Syncing time with the IC. No canisterId provided, so falling back to ryjl3-tyaaa-aaaaa-aaaba-cai',
        );
      }
      const status = await CanisterStatus.request({
        // Fall back with canisterId of the ICP Ledger
        canisterId: canisterId ?? Principal.from('ryjl3-tyaaa-aaaaa-aaaba-cai'),
        agent: this._httpAgent,
        paths: ['time'],
      });

      const replicaTime = status.get('time');
      if (replicaTime) {
        this._timeDiffMsecs = Number(replicaTime as any) - Number(callTime);
      }
    } catch (error) {
      console.error('Caught exception while attempting to sync time:', error);
    }
  }

  public replaceIdentity(identity: SignIdentity): void {
    this._identity = Promise.resolve(identity);
  }

  protected _transform(request: WsAgentRequest): Promise<WsAgentRequest> {
    let p = Promise.resolve(request);

    for (const fn of this._pipeline) {
      p = p.then(r => fn(r).then(r2 => r2 || r));
    }

    return p;
  }
}
