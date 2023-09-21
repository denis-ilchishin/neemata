export const ErrorCode = Object.freeze({
  ValidationError: 'VALIDATION_ERROR',
  BadRequest: 'BAD_REQUEST',
  NotFound: 'NOT_FOUND',
  Forbidden: 'FORBIDDEN',
  Unauthorized: 'UNAUTHORIZED',
  InternalServerError: 'INTERNAL_SERVER_ERROR',
  NotAcceptable: 'NOT_ACCEPTABLE',
  RequestTimeout: 'REQUEST_TIMEOUT',
  GatewayTimeout: 'GATEWAY_TIMEOUT',
  ServiceUnavailable: 'SERVICE_UNAVAILABLE',
  ClientRequestError: 'CLIENT_REQUEST_ERROR',
  StreamAborted: 'STREAM_ABORTED',
  StreamNotFound: 'STREAM_NOT_FOUND',
  StreamAlreadyInitalized: 'STREAM_ALREADY_INITALIZED',
})
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode]

export const MessageType = Object.freeze({
  Rpc: 1,
  StreamTerminate: 2,
  StreamPush: 3,
  StreamPull: 4,
  StreamEnd: 5,
  Event: 6,
})
export type MessageType = (typeof MessageType)[keyof typeof MessageType]

export const Transport = Object.freeze({
  Ws: 'Ws',
  Http: 'Http',
})
export type Transport = (typeof Transport)[keyof typeof Transport]

export const Scope = Object.freeze({
  Default: 'default',
  Connection: 'connection',
  Call: 'call',
})
export type Scope = (typeof Scope)[keyof typeof Scope]
