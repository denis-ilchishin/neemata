import { Transport, ValueOf, WorkerType } from '@neemata/common'
import { FastifyReply, FastifyRequest } from 'fastify'
import { TypeOf, ZodType } from 'zod'
import { Client, Guard } from './types/internal'

export type ApiModuleHandler<
  D extends ZodType,
  T extends ValueOf<typeof Transport>,
  A extends boolean,
  R = any
> = (params: {
  auth: A extends false ? null | Auth : Auth
  data: D extends ZodType ? TypeOf<D> : unknown
  req: FastifyRequest
  /**
   * Only available if request is made via http transport
   */
  res: T extends typeof Transport.Ws
    ? undefined
    : T extends typeof Transport.Ws
    ? FastifyReply
    : undefined | FastifyReply
  /**
   * Only available if request is made via ws transport
   */
  client: T extends typeof Transport.Ws
    ? undefined
    : T extends typeof Transport.Ws
    ? Client
    : undefined | Client
}) => R

export interface ApiModule<
  D extends ZodType,
  T extends ValueOf<typeof Transport>,
  A extends boolean
> {
  /**
   * Endpoint's handler
   */
  handler: ApiModuleHandler<D, T, A>
  /**
   * Yup schema to validate endpoint's body against
   */
  schema?: D
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

export interface UserApplication {
  type: ValueOf<typeof WorkerType>
  clients: Set<Client>
  createFileLogger: (
    name: string,
    level?: import('pino').Level
  ) => import('pino').BaseLogger
  workerId: number
  invoke: (
    task: string | { task: string; timeout: number },
    ...args: any[]
  ) => Promise<any>
}

export interface Auth {}
export interface Lib {}
export interface Config {}
export interface Services {}
export interface Db {}

export interface Hooks {
  startup?: () => Promise<void>
  shutdown?: () => Promise<void>
  request?: (options: {
    readonly auth: Auth | null
    readonly req: FastifyRequest
    readonly module: { name: string; version: string }
    readonly client?: Client
    readonly data?: any
  }) => Promise<void>
  connect?: (options: {
    readonly auth: Auth
    readonly client: Client
    readonly req: FastifyRequest
  }) => Promise<any>
  disconnect?: (options: {
    readonly auth: Auth
    readonly client: Client
    readonly req: FastifyRequest
  }) => Promise<any>
}

export type DefineAuthModule = <
  T extends (auth: string) => Promise<Auth | null>
>(
  module: T
) => T
export type DefineGuard = (guard: Guard) => Guard
export type DefineApiModule = <
  D extends ZodType,
  T extends ValueOf<typeof Transport>,
  A extends boolean,
  M extends ApiModule<D, T, A>
>(
  module: M
) => M

declare global {
  const application: UserApplication
  const lib: Lib
  const config: Config
  const services: Services
  const db: Db
  const hooks: Hooks
  const defineApiModule: DefineApiModule
  const defineAuthModule: DefineAuthModule
  const defineGuard: DefineGuard

  class ApiException {
    constructor(options: {
      code: string | number
      data?: any
      message?: string
    })
  }
}
