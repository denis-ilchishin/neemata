import { FastifyRequest } from 'fastify'
import JoyType, * as Joi from 'joi'
import { WebSocket } from 'ws'
import { Cache } from '../lib/core/cache'

export { Joi }

type ApiModuleHandler = (options: {
  readonly auth: Auth | null
  readonly data: any
  readonly req: FastifyRequest
  readonly client?: WebSocket
}) => any

interface ApiModule {
  schema?: Joi.Schema
  auth?: Function
  guards?: Function[]
  handler: ApiModuleHandler
}

declare global {
  
  
  interface Auth {}
  
  interface Lib {}
  interface Config {}
  interface Services {}
  interface Guards {}
  interface Db {}
  interface Application {
    cache: Cache
    invokeTask: (task: string, ...args: any[]) => Promise<any>
    wss: {
      client: (client: WebSocket, event: string, data: any) => void
      server: (event: string, data: any) => void
    }
  }

  const application: Application
  const lib: Lib
  const config: Config
  const services: Services
  const guards: Guards
  const db: Db
  const Joi: typeof JoyType

  const defineConnectionHook: (
    module: (options: {
      readonly auth: Auth
      readonly client: WebSocket
      readonly req: FastifyRequest
    }) => Promise<unknown>
  ) => unknown

  const defineDbModule: <T>(options: {
    readonly startup: () => Promise<T> | T
    readonly shutdown: (db: T) => Promise<unknown> | unknown
  }) => unknown
  const defineApiModule: (module: ApiModuleHandler | ApiModule) => unknown
  const defineAuthModule: (
    module: (options: {
      readonly req: FastifyRequest
      readonly client?: WebSocket
    }) => Promise<Auth | null>
  ) => unknown
  const defineGuardModule: (
    module: (options: {
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
    BodyValidation = 'BODY_VALIDATION',
    NotFound = 'NOT_FOUND',
    Forbidden = 'FORBIDDEN',
    Unauthorized = 'UNAUTHORIZED',
    InternalError = 'INTERNAL_SERVER_ERROR',
    Timeout = 'TIMEOUT',
  }
}
