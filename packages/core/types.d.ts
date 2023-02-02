import { Transport, ValueOf, WorkerType } from '@neemata/common'
import { Static, TSchema } from '@sinclair/typebox'
import { IncomingMessage } from 'node:http'
import { Readable } from 'node:stream'

export interface ProcedureHandlerOptions<
  D extends TSchema,
  T extends ValueOf<typeof Transport>,
  A extends boolean,
  P = A extends false ? null | Auth : Auth
> {
  data: D extends TSchema ? Static<D> : unknown
  req: Readonly<IncomingMessage>
  client: Readonly<
    T extends typeof Transport.Http
      ? HttpClient<P>
      : T extends typeof Transport.Ws
      ? WsClient<P>
      : Client<P>
  >
}

export type ProcedureHandler<
  D extends TSchema,
  T extends ValueOf<typeof Transport>,
  A extends boolean,
  R = any
> = (options: ProcedureHandlerOptions<D, T, A>) => R

export interface Procedure<
  D extends TSchema,
  T extends ValueOf<typeof Transport>,
  A extends boolean
> {
  /**
   * Endpoint's handler
   */
  handler: ProcedureHandler<D, T, A>
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
      procedure: { name: string; version: string }
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

export type DefineAuthService = <
  T extends (options: {
    session: string
    req: IncomingMessage
  }) => Promise<Auth | null>
>(
  service: T
) => T
export type DefineGuard = (guard: Guard) => Guard
export type DefineProcedure = <
  D extends TSchema,
  T extends ValueOf<typeof Transport>,
  A extends boolean = true
>(
  procedure: Procedure<D, T, A>
) => Procedure<D, T, A>

export declare type Guard = (options: {
  readonly req: import('node:http').IncomingMessage
  readonly client: Client<Auth | null>
}) => boolean | Promise<boolean>

export declare type HttpClient<Auth = unknown, T = typeof Transport.Http> = {
  readonly id: string
  readonly auth: Auth
  readonly session: string
  readonly transport: T
}

export declare type WsClient<Auth = unknown> = HttpClient<
  Auth,
  typeof Transport.Ws
> & {
  readonly send: (event: string, data?: any) => void
  readonly openedAt: Date
  readonly closedAt?: Date
}

export declare type Client<Auth = unknown> = HttpClient<Auth> | WsClient<Auth>

export type StreamTypeOptions = { maximum?: number }

declare global {
  class Stream extends Readable {
    meta: {
      size: number
      type: string
      name?: string
    }
    done(): Promise<void>
    toBuffer(): Promise<Buffer>
  }

  class ApiException {
    constructor(options: {
      code: string | number
      data?: any
      message?: string
    })
  }

  const application: UserApplication
  const lib: Lib
  const config: Config
  const services: Services
  const db: Db
  const hooks: Hooks
  const defineProcedure: DefineProcedure
  const defineAuthService: DefineAuthService
  const defineGuard: DefineGuard
  const Typebox: typeof import('@sinclair/typebox') &
    typeof import('@sinclair/typebox/compiler') &
    typeof import('@sinclair/typebox/conditional') &
    typeof import('@sinclair/typebox/custom') &
    typeof import('@sinclair/typebox/errors') &
    typeof import('@sinclair/typebox/format') &
    typeof import('@sinclair/typebox/guard') &
    typeof import('@sinclair/typebox/hash') &
    typeof import('@sinclair/typebox/system') &
    typeof import('@sinclair/typebox/value') & {
      Stream: (
        options?: Partial<StreamTypeOptions>
      ) => import('@sinclair/typebox').TUnsafe<Stream>
    }
}
