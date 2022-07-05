export const Protocol = Object.freeze({
  Http: 'http',
  Ws: 'ws',
})

export const MessageType = Object.freeze({
  Api: 'api',
  Room: 'room',
  Server: 'server',
})

export const ErrorCode = Object.freeze({
  BodyValidation: 'BODY_VALIDATION',
  NotFound: 'NOT_FOUND',
  Forbidden: 'FORBIDDEN',
  InternalError: 'INTERNAL_SERVER_ERROR',
  Timeout: 'TIMEOUT',
  RequestError: 'REQUEST_ERROR',
  Unauthorized: 'UNAUTHORIZED',
})
