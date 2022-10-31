import { FastifyReply, FastifyRequest } from 'fastify'
import { TypeOf, ZodType } from 'zod'
import { Client } from '../lib/client'

export type LogLevel = 'log' | 'warn' | 'error' | 'info' | 'debug'

export interface Logger {
  warn(content: string, group?: string): void
  error(err: Error | string, group?: string): void
  info(content: string, group?: string): void
  debug(content: string, group?: string): void
}

export type ApiModuleHandler<
  S extends ZodType | unknown,
  T extends 'http' | 'ws' | unknown,
  A extends boolean | unknown
> = (params: {
  auth: A extends false ? null : Auth
  data: S extends ZodType ? TypeOf<S> : unknown
  req: FastifyRequest
  /**
   * Only available if request is made via http transport
   */
  res: T extends 'ws'
    ? undefined
    : T extends 'http'
    ? FastifyReply
    : FastifyReply | undefined
  /**
   * Only available if request is made via ws transport
   */
  client: T extends 'http'
    ? undefined
    : T extends 'ws'
    ? Client
    : Client | undefined
}) => any

export interface ApiModule<
  S extends ZodType,
  T extends 'http' | 'ws',
  A extends boolean
> {
  /**
   * Endpoint's handler
   */
  handler: ApiModuleHandler<S, T, A>
  /**
   * Yup schema to validate endpoint's body against
   */
  schema?: S
  /**
   * Whether current endpoint is available only for authenticated users or not
   * @default true
   */
  auth?: A
  /**
   * Collection of endpoint guards. Evaluated after authentication
   */
  guards?: Guard[]
  /**
   * Restrict endpoint to be accessible via only one transport
   */
  transport?: T
  /**
   * Execution timeout for current endpoint
   */
  timeout?: number
  /**
   * Whether current endpoint is introspectable from client application or not
   * @default true
   */
  introspectable?: boolean | Guard
}

export type AuthModule = (auth: string) => Promise<Auth | null>

export type Guard = (options: {
  readonly req: FastifyRequest
  readonly auth: Auth | null
}) => boolean | Promise<boolean>

export type ConnectionHook = (options: {
  readonly auth: Auth
  readonly client: Client
  readonly req: FastifyRequest
}) => Promise<any>

export interface Auth {}

export interface Application {
  clients: Set<Client>
  type: keyof typeof WorkerType
  createFileLogger: (
    name: string,
    level?: LogLevel | LogLevel[]
  ) => import('pino').BaseLogger
  workerId: number
  invoke: (
    task: string | { task: string; timeout: number },
    ...args: any[]
  ) => Promise<any>
}

export interface Lib {}
export interface Config {}
export interface Services {}
export interface Db {}

export interface NeemataConfig {
  workers: number
  ports: number[]
  api: {
    /**
     * @default "0.0.0.0"
     */
    hostname: string
    /**
     * Must start with slash
     * @default "/api"
     */
    baseUrl: string
    cors: import('@fastify/cors').FastifyCorsOptions
    multipart: import('@fastify/multipart').FastifyMultipartOptions
  }
  log: {
    basePath: string
    level: 'debug' | 'info' | 'warn' | 'error'
  }
  auth: {
    service: string
  }
  timeouts: {
    /**
     * @default 10000
     */
    startup: number
    /**
     * @default 10000
     */
    shutdown: Number
    /**
     * @default 250
     */
    hrm: number
    /**
     * @default 5000
     */
    request: number
    task: {
      /**
       * @default 15000
       */
      execution: number
      /**
       * @default 30000
       */
      allocation: number
    }
  }
  intervals: {
    /**
     * @default 30000
     */
    ping: number
  }
  scheduler: {
    tasks: Array<{
      name: string
      task: string
      cron: string
      timeout: string
      args?: any[]
    }>
  }
}

declare global {
  const application: Application
  const lib: Lib
  const config: Config
  const services: Services
  const guards: Guards
  const db: Db

  const defineApiModule: <
    S extends ZodType,
    T extends 'http' | 'ws',
    A extends boolean
  >(
    module: ApiModule<S, T, A> | ApiModuleHandler<unknown, unknown, unknown>
  ) => any

  const defineAuthModule: (module: AuthModule) => AuthModule

  const defineConnectionHook: <T extends ConnectionHook>(module: T) => T

  const defineGuard: (guard: Guard) => Guard

  class ApiException {
    constructor(options: {
      code: string | number
      data?: any
      message?: string
    })
  }

  export const WorkerType = {
    Api: 'Api',
    Task: 'Task',
    OneOff: 'OneOff',
  } as const

  export const ErrorCode = {
    ValidationError = 'VALIDATION_ERROR',
    BadRequest = 'BAD_REQUEST',
    NotFound = 'NOT_FOUND',
    Forbidden = 'FORBIDDEN',
    Unauthorized = 'UNAUTHORIZED',
    InternalServerError = 'INTERNAL_SERVER_ERROR',
    GatewayTimeout = 'GATEWAY_TIMEOUT',
  } as const
}
