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
})
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode]

export const Scope = Object.freeze({
  Global: 'global',
  Connection: 'connection',
  Call: 'call',
})
export type Scope = (typeof Scope)[keyof typeof Scope]

export class ApiError extends Error {
  code: string
  data?: any

  constructor(code: string, message?: string, data?: any) {
    super(message)
    this.code = code
    this.data = data
  }

  get message() {
    return this.code + super.message
  }

  toString() {
    return `${this.code} ${this.message}`
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      data: this.data,
    }
  }
}
