export const MessageType = Object.freeze({
  Rpc: 1,
  StreamTerminate: 2,
  StreamPush: 3,
  StreamPull: 4,
  StreamEnd: 5,
  Event: 6,
})
export type MessageType = (typeof MessageType)[keyof typeof MessageType]
