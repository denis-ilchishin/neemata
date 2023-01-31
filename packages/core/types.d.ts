import { Transport, ValueOf, WorkerType } from '@neemata/common'
import { Static, TSchema } from '@sinclair/typebox'
import { IncomingMessage } from 'node:http'
import { Client, Guard, HttpClient, WsClient } from './types/internal'

export interface ApiModuleHandlerOptions<
  D extends TSchema,
  T extends ValueOf<typeof Transport>,
  A extends boolean
> {
  data: D extends TSchema ? Static<D> : unknown
  req: Readonly<IncomingMessage>
  client: Readonly<
    T extends typeof Transport.Http
      ? HttpClient<A extends false ? null | Auth : Auth>
      : T extends typeof Transport.Ws
      ? WsClient<A extends false ? null | Auth : Auth>
      : Client<A extends false ? null | Auth : Auth>
  >
}

export type ApiModuleHandler<
  D extends TSchema,
  T extends ValueOf<typeof Transport>,
  A extends boolean,
  R = any
> = (options: ApiModuleHandlerOptions<D, T, A>) => R

export interface ApiModule<
  D extends TSchema,
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
  introspectable?: boolean | 'guards' | Guard
}

export interface UserApplication {
  type: ValueOf<typeof WorkerType>
  clients: Set<Client>
  createFileLogger: (
    name: string,
    level?: import('pino').Level
  ) => import('pino').BaseLogger
  workerId: number
  invoke: <K extends keyof Tasks>(
    task: K | { task: K; timeout: number },
    ...args: Parameters<Tasks[K]>
  ) => Promise<Awaited<ReturnType<Tasks[K]>>>
}

export interface Auth {}
export interface Lib {}
export interface Config {}
export interface Services {}
export interface Db {}
export interface Tasks {}

export interface Hooks {
  startup?: () => Promise<any>
  shutdown?: () => Promise<any>
  call?: (
    options: Readonly<{
      data?: any
      client: Client
      req: IncomingMessage
      module: { name: string; version: string }
    }>
  ) => Promise<any>
  connect?: (
    options: Readonly<{
      client: Client
      req: IncomingMessage
    }>
  ) => Promise<any>
  disconnect?: (
    options: Readonly<{
      client: Client
      req: IncomingMessage
    }>
  ) => Promise<any>
}

export type DefineAuthModule = <
  T extends (auth: string) => Promise<Auth | null>
>(
  module: T
) => T
export type DefineGuard = (guard: Guard) => Guard
export type DefineApiModule = <
  D extends TSchema,
  T extends ValueOf<typeof Transport>,
  A extends boolean
>(
  module: ApiModule<D, T, A>
) => ApiModule<D, T, A>

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
  const Typebox: typeof import('@sinclair/typebox') & {
    compiler: typeof import('@sinclair/typebox/compiler')
    conditional: typeof import('@sinclair/typebox/conditional')
    custom: typeof import('@sinclair/typebox/custom')
    errors: typeof import('@sinclair/typebox/errors')
    format: typeof import('@sinclair/typebox/format')
    guard: typeof import('@sinclair/typebox/guard')
    hash: typeof import('@sinclair/typebox/hash')
    system: typeof import('@sinclair/typebox/system')
    value: typeof import('@sinclair/typebox/value')
  }

  class ApiException {
    constructor(options: {
      code: string | number
      data?: any
      message?: string
    })
  }
}
