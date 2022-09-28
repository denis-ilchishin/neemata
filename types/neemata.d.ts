import { FastifyReply, FastifyRequest } from 'fastify'
import { WebSocket as _WebSocket } from 'ws'
import { TypeOf, ZodType } from 'zod'
import { Cache } from '../lib/core/cache'
import { Subscriber } from '../lib/core/subscriber'

type WebSocket = _WebSocket & {
  /**
   * Socket unique id
   */
  id: string

  /**
   * Socket auth entity
   */
  auth: Auth | null
}

export type ApiModuleHandler<Schema extends ZodType | unknown> = (params: {
  auth: Auth | null
  data: Schema extends ZodType ? TypeOf<Schema> : unknown
  req: FastifyRequest
  res: FastifyReply
  /**
   * Only available if request is made via ws protocol
   */
  client?: WebSocket
}) => any

export interface ApiModule<Schema extends ZodType> {
  /**
   * Endpoint's handler
   */
  handler: ApiModuleHandler<Schema>
  /**
   * Yup schema to validate endpoint's body against
   */
  schema?: Schema
  /**
   * Whether current endpoint is available only for authenticated users or not
   * @default true
   */
  auth?: boolean
  /**
   * Collection of endpoint guards. Evaluated after authentication
   */
  guards?: Guard[]
  /**
   * Restrict endpoint to be accessible via only one protocol. When
   */
  protocol?: 'http' | 'ws'
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
  readonly client: WebSocket
  readonly req: FastifyRequest
}) => Promise<any>

export interface Auth {}

export interface Application {
  workerId: number
  cache?: Cache
  subscriber?: Subscriber
  invokeTask: (
    task: string | { task: string; timeout: number },
    ...args: any[]
  ) => Promise<any>
  wss: {
    clients: Set<WebSocket>
    emit: (event: string, data: any, client?: WebSocket) => void
  }
}

export interface Lib {}
export interface Config {}
export interface Services {}
export interface Guards {}
export interface Db {}

declare global {
  const application: Application
  const lib: Lib
  const config: Config
  const services: Services
  const guards: Guards
  const db: Db

  const defineApiModule: <Schema extends ZodType>(
    module: ApiModule<Schema> | ApiModuleHandler<unknown>
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
