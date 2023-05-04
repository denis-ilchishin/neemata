import { Transport, WorkerHook, WorkerType } from '@neemata/common'
import { Static, TSchema } from '@sinclair/typebox'
import { IncomingMessage } from 'node:http'
import { Readable } from 'node:stream'
import { TypeOf, ZodType } from 'zod'

export interface ProcedureHandlerOptions<
  D extends TSchema | ZodType,
  T extends Transport,
  A extends boolean,
  P = A extends false ? null | Auth : Auth
> {
  data: D extends TSchema ? Static<D> : D extends ZodType ? TypeOf<D> : unknown
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
  D extends TSchema | ZodType,
  T extends Transport,
  A extends boolean,
  R extends any
> = (options: ProcedureHandlerOptions<D, T, A>) => R

export interface Procedure<
  D extends TSchema | ZodType,
  T extends Transport,
  A extends boolean,
  R extends any
> {
  /**
   * Endpoint's handler
   */
  handler: ProcedureHandler<D, T, A, R>
  /**
   * Zod or Typebox schema to validate endpoint's input data against
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
   * Restrict endpoint to be accessible via only specific transport
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
  /**
   * Allow access via http GET method. Useful for serving binary data via URL
   * @default false
   */
  allowGetMethod?: boolean
}

export interface UserApplication {
  clients: Set<WsClient<Auth | null>>
  createFileLogger: (
    name: string,
    level?: import('pino').Level
  ) => import('pino').BaseLogger
  worker: {
    type: WorkerType
    workerId: number
    threadId: number
  }
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
export interface Injections {}
export interface Api {}

export interface Hooks {
  [WorkerHook.Startup]?: () => Promise<any>
  [WorkerHook.Shutdown]?: () => Promise<any>
  [WorkerHook.Call]?: (
    options: Readonly<{
      data?: any
      client: Client<Auth | null>
      req: IncomingMessage
      procedure: { name: string }
    }>
  ) => Promise<any>
  [WorkerHook.Connect]?: (
    options: Readonly<{
      client: WsClient<Auth | null>
      req: IncomingMessage
    }>
  ) => Promise<any>
  [WorkerHook.Disconnect]?: (
    options: Readonly<{
      client: WsClient<Auth | null>
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
  D extends TSchema | ZodType,
  T extends Transport,
  A extends boolean = true,
  R extends any = any
>(
  procedure: Procedure<D, T, A, R>
) => Procedure<D, T, A, R>

export declare type Guard = (options: {
  readonly req: import('node:http').IncomingMessage
  readonly client: Client<Auth | null>
}) => boolean | Promise<boolean>

export declare interface HttpClient<Auth = unknown, T = typeof Transport.Http> {
  readonly id: string
  readonly auth: Auth
  readonly transport: T
}

export declare interface WsClient<Auth = unknown>
  extends HttpClient<Auth, typeof Transport.Ws> {
  readonly send: (event: string, data?: any) => void
  readonly openedAt: Date
  readonly closedAt?: Date
}

export declare type Client<Auth = unknown> = HttpClient<Auth> | WsClient<Auth>

export type StreamTypeOptions = { maximum?: number }

declare global {
  const ErrorCode: typeof import('@neemata/common').ErrorCode
  const WorkerType: typeof import('@neemata/common').WorkerType

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

  class BinaryHttpResponse {
    constructor(options: {
      data: Buffer | ReadableStream
      encoding?: string
      contentType?: string
    })
  }

  const application: UserApplication
  const hooks: Hooks
  const lib: Lib
  const config: Config
  const services: Services
  const db: Db
  const defineProcedure: DefineProcedure
  const defineAuthService: DefineAuthService
  const defineGuard: DefineGuard
  const dependency: <T extends keyof Injections>(
    ...dependencies: T[]
  ) => Promise<void>
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
  const zod: typeof import('zod') & {
    stream: (
      options?: Partial<StreamTypeOptions>
    ) => import('zod').ZodType<Stream>
  }
}
