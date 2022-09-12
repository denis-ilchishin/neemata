export enum Protocol {
  Http = 'http',
  Ws = 'ws',
}

export enum MessageType {
  Api = 'api',
  Server = 'server',
}

export enum ErrorCode {
  ValidationError = 'VALIDATION_ERROR',
  BadRequest = 'BAD_REQUEST',
  NotFound = 'NOT_FOUND',
  Forbidden = 'FORBIDDEN',
  Unauthorized = 'UNAUTHORIZED',
  InternalServerError = 'INTERNAL_SERVER_ERROR',
  GatewayTimeout = 'GATEWAY_TIMEOUT',
  Unauthorized = 'UNAUTHORIZED',
}
