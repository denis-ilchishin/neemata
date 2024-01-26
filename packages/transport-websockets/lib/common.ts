export const MessageType = Object.freeze({
  Event: 10,
  Rpc: 11,
  RpcStream: 12,
  RpcSubscription: 13,

  // Client streams
  ClientStreamAbort: 30,
  ClientStreamPush: 31,
  ClientStreamPull: 32,
  ClientStreamEnd: 33,

  // Client subsctiption
  ClientUnsubscribe: 34,

  // Server streams
  ServerStreamAbort: 50,
  ServerStreamPull: 51,
  ServerStreamPush: 52,
  ServerStreamEnd: 53,

  // Server subsctiption
  ServerUnsubscribe: 54,
  ServerSubscriptionEmit: 55,
})
export type MessageType = (typeof MessageType)[keyof typeof MessageType]

export enum HttpTransportMethod {
  Get = 'get',
  Post = 'post',
}

export const HttpPayloadGetParam = '_payload'
