import { FastifyRequest } from 'fastify'
import * as Joi from 'joi'
import { WebSocket } from 'ws'

export { Joi }

type ApiModuleHandler = (options: {
  readonly auth: Neemata['auth'] | null
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
  interface Neemata {
    // auth: any
  }

  interface Lib {}
  interface Config {}
  interface Services {}
  interface Guards {}
  interface Db {}
  interface Application {
    task: (task: string, ...args: any[]) => Promise<any>
    wss: {
      message: (event: string, data: any) => void
      // rooms: {
      //   get: (roomId: string) => void
      //   join: (roomId: string, client: WebSocket) => void
      //   leave: (roomId: string, client: WebSocket) => void
      //   remove: (roomId: string) => void
      //   message: (roomId: string, options: { event: string; data: any }) => void
      // }
    }
  }

  const application: Application
  const lib: Lib
  const config: Config
  const services: Services
  const guards: Guards
  const db: Db

  const defineConnectionHook: (
    module: (options: {
      readonly auth: Neemata['auth']
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
    }) => Promise<Neemata['auth'] | null>
  ) => unknown
  const defineGuardModule: (
    module: (options: {
      readonly req: FastifyRequest
      readonly auth: Neemata['auth']
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
