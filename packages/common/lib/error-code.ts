import { ValueOf } from './utils'

export const ErrorCode = {
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
} as const

export type ErrorCode = ValueOf<typeof ErrorCode>
