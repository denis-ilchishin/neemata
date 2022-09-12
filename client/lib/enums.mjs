export const Protocol = Object.freeze({
  Http: 'http',
  Ws: 'ws',
})

export const MessageType = Object.freeze({
  Api: 'api',
  Server: 'server',
})

export const ErrorCode = Object.freeze({
  ValidationError: 'VALIDATION_ERROR',
  BadRequest: 'BAD_REQUEST',
  NotFound: 'NOT_FOUND',
  Forbidden: 'FORBIDDEN',
  Unauthorized: 'UNAUTHORIZED',
  InternalServerError: 'INTERNAL_SERVER_ERROR',
  GatewayTimeout: 'GATEWAY_TIMEOUT',
  RequestError: 'REQUEST_ERROR',
})
