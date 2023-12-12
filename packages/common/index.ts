import { EventEmitter } from 'events'

export enum ErrorCode {
  ValidationError = 'ValidationError',
  BadRequest = 'BadRequest',
  NotFound = 'NotFound',
  Forbidden = 'Forbidden',
  Unauthorized = 'Unauthorized',
  InternalServerError = 'InternalServerError',
  NotAcceptable = 'NotAcceptable',
  RequestTimeout = 'RequestTimeout',
  GatewayTimeout = 'GatewayTimeout',
  ServiceUnavailable = 'ServiceUnavailable',
  ClientRequestError = 'ClientRequestError',
  ConnectionError = 'ConnectionError',
}

export enum Scope {
  Global = 'Global',
  Connection = 'Connection',
  Call = 'Call',
}

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

export type ApiProcedureType = {
  input?: any
  output?: any
}

export type ResolveProcedureApiType<
  Api,
  Key,
  Type extends keyof ApiProcedureType
> = Key extends keyof Api
  ? Api[Key] extends ApiProcedureType
    ? Api[Key][Type]
    : any
  : any

export type Call = {
  resolve: (value?: any) => void
  reject: (reason?: any) => void
  timer: ReturnType<typeof setTimeout>
}

export abstract class BaseClient<
  Api extends any = never,
  RPCOptions = never
> extends EventEmitter {
  abstract rpc<P extends keyof Api>(
    procedure: P,
    ...args: Api extends never
      ? [any?, RPCOptions?]
      : null | undefined extends ResolveProcedureApiType<Api, P, 'input'>
      ? [ResolveProcedureApiType<Api, P, 'input'>?, RPCOptions?]
      : [ResolveProcedureApiType<Api, P, 'input'>, RPCOptions?]
  ): Promise<
    Api extends never ? any : ResolveProcedureApiType<Api, P, 'output'>
  >
  abstract connect(): Promise<void>
  abstract disconnect(): Promise<void>
  abstract reconnect(): Promise<void>
}
