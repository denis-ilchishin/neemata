export const MessageType = Object.freeze({
  Event: 10,
  Rpc: 11,
  RpcStream: 12,

  // Client streams
  ClientStreamAbort: 20,
  ClientStreamPush: 21,
  ClientStreamPull: 22,
  ClientStreamEnd: 23,

  // Server streams
  ServerStreamAbort: 30,
  ServerStreamPull: 31,
  ServerStreamPush: 32,
  ServerStreamEnd: 33,
})
export type MessageType = (typeof MessageType)[keyof typeof MessageType]
