export const ErrorCode = Object.freeze({
  ValidationError: 'VALIDATION_ERROR',
  BadRequest: 'BAD_REQUEST',
  NotFound: 'NOT_FOUND',
  Forbidden: 'FORBIDDEN',
  Unauthorized: 'UNAUTHORIZED',
  InternalServerError: 'INTERNAL_SERVER_ERROR',
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
  RPC: 1,
  STREAM_TERMINATE: 2,
  STREAM_PUSH: 3,
  STREAM_PULL: 4,
  STREAM_END: 5,
})
export type MessageType = (typeof MessageType)[keyof typeof MessageType]
