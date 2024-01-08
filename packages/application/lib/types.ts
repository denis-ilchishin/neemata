import type { Api, Procedure } from './api'
import { Application } from './application'
import type { Container, Provider } from './container'
import type { Logger } from './logger'
import type { Task, TaskInterface } from './tasks'
import type { BaseTransportConnection } from './transport'

export enum Scope {
  Global = 'Global',
  Connection = 'Connection',
  Call = 'Call',
  Transient = 'Transient',
}

export enum Hook {
  BeforeInitialize = 'BeforeInitialize',
  AfterInitialize = 'AfterInitialize',
  BeforeStart = 'BeforeStart',
  AfterStart = 'AfterStart',
  BeforeStop = 'BeforeStop',
  AfterStop = 'AfterStop',
  BeforeTerminate = 'BeforeTerminate',
  AfterTerminate = 'AfterTerminate',
}

export enum WorkerType {
  Api = 'Api',
  Task = 'Task',
}

export enum WorkerMessageType {
  Ready = 'Ready',
  Start = 'Start',
  Stop = 'Stop',
  ExecuteInvoke = 'ExecuteInvoke',
  ExecuteResult = 'ExecuteResult',
  ExecuteAbort = 'ExecuteAbort',
}

export type Callback = (...args: any[]) => any
export type Pattern = RegExp | string | ((value: string) => boolean)
export type OmitFirstItem<T extends any[]> = T extends [any, ...infer U]
  ? U
  : []
export type ErrorClass = new (...args: any[]) => Error
export type Extra = Record<string, any>
export type Async<T> = T | Promise<T>

export type Filter<T extends ErrorClass> = (error: InstanceType<T>) => Error

export interface LoaderInterface<T> {
  modules: Map<string, T>
}

export type Command = (
  options: {
    args: string[]
    kwargs: Record<string, any>
  },
  ...args: any[]
) => any

export type ConnectionFn<T = any, C = any> = (transportData: T) => C

export type GuardOptions<App extends AnyApplication = AnyApplication> = {
  connection: App['_']['connection']
  name: string
}

export type GuardFn<App extends AnyApplication = AnyApplication> = (
  options: GuardOptions<App>
) => Async<boolean>

export type MiddlewareFn<App extends AnyApplication = AnyApplication> = (
  options: MiddlewareContext<App>,
  next: Next,
  payload: any
) => any

export type Guard = Provider<GuardFn>

export type Middleware = Provider<MiddlewareFn>

export type ConnectionProvider<T, C> = Provider<ConnectionFn<T, C>>

export type AnyApplication = Application<any, any, any, any, any, any>

export type MiddlewareContext<App extends AnyApplication = AnyApplication> = {
  connection: App['_']['connection']
  name: string
  container: Container
  procedure: Procedure
}

export type Next = (payload?: any) => any

export interface HooksInterface {
  [Hook.BeforeInitialize]: () => any
  [Hook.AfterInitialize]: () => any
  [Hook.BeforeStart]: () => any
  [Hook.AfterStart]: () => any
  [Hook.BeforeStop]: () => any
  [Hook.AfterStop]: () => any
  [Hook.BeforeTerminate]: () => any
  [Hook.AfterTerminate]: () => any
}

export type CallHook<T extends string> = (
  hook: T,
  ...args: T extends keyof HooksInterface
    ? Parameters<HooksInterface[T]>
    : any[]
) => Promise<void>

export interface ExtensionApplication<
  Options extends Extra = {},
  Context extends Extra = {}
> {
  type: WorkerType
  api: Api
  container: Container
  logger: Logger
  connections: Map<BaseTransportConnection['id'], BaseTransportConnection>
  registerHook<T extends string>(
    hookName: T,
    hook: T extends keyof HooksInterface
      ? HooksInterface[T]
      : (...args: any[]) => any
  ): void
  registerMiddleware(middleware: Middleware): void
  registerCommand(commandName: string, command: Command): void
  registerFilter<T extends ErrorClass>(error: T, filter: Filter<T>): void
}

export interface ExtensionInterface<
  ProcedureOptions extends Extra = {},
  Context extends Extra = {}
> {
  readonly _: {
    context: Context
    options: ProcedureOptions
  }
  readonly application: AnyApplication
  context?(): Context
  initialize?(): any
}

export type ResolveExtensionProcedureOptions<Extension> =
  Extension extends ExtensionInterface<infer Options> ? Options : {}

export type ResolveExtensionContext<Extension> =
  Extension extends ExtensionInterface<any, infer Context> ? Context : {}

export type UnionToIntersection<U> = (
  U extends any ? (k: U) => void : never
) extends (k: infer I) => void
  ? I
  : never

export type InferSchemaOutput<Schema> = Schema extends import('zod').ZodSchema
  ? import('zod').TypeOf<Schema>
  : Schema extends import('@sinclair/typebox').TSchema
  ? import('@sinclair/typebox').Static<Schema>
  : unknown

export type InferSchemaInput<Schema> = Schema extends import('zod').ZodSchema
  ? import('zod').input<Schema>
  : Schema extends import('@sinclair/typebox').TSchema
  ? import('@sinclair/typebox').Static<Schema>
  : unknown

export type Primitive = string | number | boolean | null
export type Scalars = Primitive | Primitive[]

export type GlobalContext = {
  logger: Logger
  execute: <T extends Task>(
    task: T,
    ...args: OmitFirstItem<Parameters<T['handler']>>
  ) => TaskInterface<Awaited<ReturnType<T['handler']>>>
}

export type Filters = Map<ErrorClass, Filter<ErrorClass>>
export type Middlewares = Set<Middleware>
export type Guards = Set<Guard>
export type Commands<T extends string | symbol = string | symbol> = Map<
  T,
  Map<string, Command>
>
export type Hooks = Map<string, Set<(...args: any[]) => any>>
