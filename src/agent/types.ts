import { CallRequest, Endpoint, Envelope, QueryRequest, ReadStateRequest } from '@dfinity/agent';

export type WsAgentRequest = WsAgentQueryRequest | WsAgentSubmitRequest | WsAgentReadStateRequest;

export interface WsAgentBaseRequest {
  readonly endpoint: Endpoint;
}

export interface WsAgentSubmitRequest extends WsAgentBaseRequest {
  readonly endpoint: Endpoint.Call;
  message: CallRequest;
}

export interface WsAgentQueryRequest extends WsAgentBaseRequest {
  readonly endpoint: Endpoint.Query;
  message: QueryRequest;
}

export interface WsAgentReadStateRequest extends WsAgentBaseRequest {
  readonly endpoint: Endpoint.ReadState;
  message: ReadStateRequest;
}

export interface WsAgentRequestTransformFn {
  (args: WsAgentRequest): Promise<WsAgentRequest | undefined | void>;
  priority?: number;
}

export type WsAgentRequestMessage<T> = {
  envelope: Envelope<T>;
}
