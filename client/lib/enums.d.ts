export enum Protocol {
  Http = 'http',
  Ws = 'ws',
}

export enum MessageType {
  Api = 'api',
  Room = 'room',
  Server = 'server',
}

export enum ErrorCode {
  BodyValidation = 'BODY_VALIDATION',
  NotFound = 'NOT_FOUND',
  Forbidden = 'FORBIDDEN',
  InternalError = 'INTERNAL_SERVER_ERROR',
  Timeout = 'TIMEOUT',
  Unauthorized = 'UNAUTHORIZED',
}
