import { FastifyReply, FastifyRequest } from 'fastify'
import * as Joi from 'joi'
import { WebSocket as _WebSocket } from 'ws'
import { Cache } from '../lib/core/cache'
import { Subscriber } from '../lib/core/subscriber'

type WebSocket = _WebSocket & { auth: Auth | null }

export type ApiModuleHandler<T> = (options: {
  readonly auth: Auth | null
  readonly data: any
  readonly req: FastifyRequest
  readonly res: FastifyReply
  readonly client?: WebSocket
}) => T

export interface ApiModule<T> {
  schema?: Joi.Schema
  auth?: boolean
  guards?: Function[]
  handler: ApiModuleHandler<T>
  protocol?: 'http' | 'ws'
}

export type ApiModuleType<T> = ApiModuleHandler<T> | ApiModule<T>

declare global {
  interface Auth {}

  interface Lib {}
  interface Config {}
  interface Services {}
  interface Guards {}
  interface Db {}
  interface Application {
    workerId: number
    cache?: Cache
    subscriber?: Subscriber
    invokeTask: (task: string, ...args: any[]) => Promise<any>
    wss: {
      clients: Set<WebSocket>
      emit: (event: string, data: any, client?: WebSocket) => void
    }
  }

  const application: Application
  const lib: Lib
  const config: Config
  const services: Services
  const guards: Guards
  const db: Db

  const defineApiModule: <Res, T extends ApiModuleType<Res>>(module: T) => T

  const defineAuthModule: (
    module: (auth: string) => Promise<Auth | null>
  ) => unknown

  const defineConnectionHook: (
    module: (options: {
      readonly auth: Auth
      readonly client: WebSocket
      readonly req: FastifyRequest
    }) => Promise<unknown>
  ) => unknown

  const defineGuard: (
    guard: (options: {
      readonly req: FastifyRequest
      readonly auth: Auth
    }) => boolean
  ) => unknown

  class ApiException {
    constructor(options: {
      code: string | number
      data?: any
      message?: string
    })
  }

  enum ErrorCode {
    ValidationError = 'VALIDATION_ERROR',
    BadRequest = 'BAD_REQUEST',
    NotFound = 'NOT_FOUND',
    Forbidden = 'FORBIDDEN',
    Unauthorized = 'UNAUTHORIZED',
    InternalServerError = 'INTERNAL_SERVER_ERROR',
    GatewayTimeout = 'GATEWAY_TIMEOUT',
  }
}

export { WebSocket }
