import { Scope as ProviderScope } from '@neemata/common'
import { Static, TSchema } from '@sinclair/typebox'
import { TypeOf, ZodSchema } from 'zod'
import { Api, BaseParser } from './api'
import { Application } from './application'
import { Container } from './container'
import { Logger } from './logger'

export type ApplicationOptions = {
  type?: WorkerType
  logging?: {
    level: import('pino').Level
  }
  api?: {
    parser?: BaseParser
    path?: string
  }
  tasks?: {
    path?: string
    runner?: TasksRunner
  }
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

export enum WorkerMessageType {
  Ready = 'Ready',
  Start = 'Start',
  Stop = 'Stop',
  ExecuteInvoke = 'ExecuteInvoke',
  ExecuteResult = 'ExecuteResult',
  ExecuteAbort = 'ExecuteAbort',
}

export enum WorkerType {
  Api = 'Api',
  Task = 'Task',
}

export type Callback = (...args: any[]) => any

export type Pattern = RegExp | string | ((value: string) => boolean)

export type OmitFirstItem<T extends any[]> = T extends [any, ...infer U]
  ? U
  : []

export type ErrorClass = new (...args: any[]) => Error

export type Filter<T extends ErrorClass> = (error: InstanceType<T>) => Error

export type Extra = Record<string, any>

export type Dependencies = Record<string, ProviderDeclaration>

export type Filters = Map<ErrorClass, Filter<ErrorClass>>
export type Middlewares = Map<Pattern, Set<Middleware>>
export type Commands<T extends string = string> = Map<T, Map<string, Command>>
export type Hooks = Map<string, Set<(...args: any[]) => any>>
export interface LoaderInterface<T> {
  modules: Map<string, T>
}

export type Async<T> = T | Promise<T>

export type ProcedureOption<T, Context extends Extra = {}> =
  | T
  | ((context: Context) => Async<T>)

export type ProcedureContext = {
  call: <
    Declaration extends ProcedureDeclaration<any, any, any, any, any, any>
  >(
    declaration: Declaration,
    ...args: OmitFirstItem<Parameters<Declaration['procedure']['handle']>>
  ) => TaskInterface<Awaited<ReturnType<Declaration['procedure']['handle']>>>
}

export type Command = (
  options: {
    args: string[]
    kwargs: Record<string, string | string[]>
  },
  ...args: any[]
) => any

export type Middleware = (
  options: ExtensionMiddlewareOptions,
  payload: any,
  next: Next
) => any

export type ProcedureDataType<
  Input,
  Schema = Input extends Promise<any> ? Awaited<Input> : Input
> = Schema extends ZodSchema
  ? TypeOf<Schema>
  : Schema extends TSchema
  ? Static<Schema>
  : unknown

export type BaseProcedure<
  Deps extends Dependencies,
  Options extends Extra,
  Context extends Extra,
  Input,
  Response,
  Output
> = AsProcedureOptions<Options, DependencyContext<Context, Deps>> & {
  input?: Input | ((ctx: DependencyContext<Context, Deps>) => Input)
  handle: (
    ctx: DependencyContext<Context, Deps> & ProcedureContext,
    data: ProcedureDataType<Input>
  ) => Response
  output?:
    | Output
    | ((
        ctx: DependencyContext<Context, Deps>,
        data: Awaited<Response>
      ) => Output)
}

export interface Depender<Deps extends Dependencies> {
  dependencies: Deps
}

export type AsProcedureOptions<
  Options extends Extra = {},
  Context extends Extra = {}
> = {
  [K in keyof Options]: ProcedureOption<Options[K], Context>
}

export type ExtensionMiddlewareOptions<
  Options extends Extra = {},
  Context extends Extra = {}
> = {
  name: string
  context: DependencyContext<Extra, {}>
  container: Container
  procedure: BaseProcedure<Dependencies, Options, Context, any, any, any>
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

export interface ExtensionInstallOptions<
  Options extends Extra = {},
  Context extends Extra = {}
> {
  api: Api<Options, Context>
  container: Container
  logger: Logger

  callHook: CallHook<keyof HooksInterface>
  registerHook<T extends string>(
    hookName: T,
    hook: T extends keyof HooksInterface
      ? HooksInterface[T]
      : (...args: any[]) => any
  ): void
  registerMiddleware(pattern: Pattern, middleware: Middleware): void
  registerCommand(commandName: string, command: Command): void
  registerFilter<T extends ErrorClass>(error: T, filter: Filter<T>): void
}

export interface ExtensionInterface<
  ProcedureOptions extends Extra = {},
  Context extends Extra = {}
> {
  context?(): Context
  install?(options: ExtensionInstallOptions<ProcedureOptions, Context>): void
  _options: ProcedureOptions
}

export type ResolveExtensionOptions<Extension> =
  Extension extends ExtensionInterface<infer Options> ? Options : {}

export type ResolveExtensionContext<Extension> =
  Extension extends ExtensionInterface<infer Options, infer Context>
    ? Context
    : {}

export type UnionToIntersection<U> = (
  U extends any ? (k: U) => void : never
) extends (k: infer I) => void
  ? I
  : never

export type ResolvedDependencyInjection<T extends ProviderDeclaration> =
  Awaited<T extends ProviderDeclaration<infer Type> ? Type : never>

export type GlobalContext = {
  logger: Logger
  execute: <T extends TaskDeclaration<any, any, any, any>>(
    task: T,
    ...args: OmitFirstItem<Parameters<T['task']['handle']>>
  ) => TaskInterface<Awaited<ReturnType<T['task']['handle']>>>
}

export type DependencyContext<
  Context extends Extra,
  Deps extends Dependencies
> = Context & {
  injections: {
    [K in keyof Deps]: ResolvedDependencyInjection<Deps[K]>
  }
  scope: ProviderScope
} & GlobalContext

export type ProviderFactory<
  Type,
  Context extends Extra,
  Deps extends Dependencies
> = (ctx: DependencyContext<Context, Deps>) => Async<Type>

export type ProviderDispose<
  Type,
  Context extends Extra,
  Deps extends Dependencies
> = (ctx: DependencyContext<Context, Deps>, value: Type) => any

export type Provider<
  Type,
  Context extends Extra,
  Deps extends Dependencies,
  Scope extends ProviderScope
> = {
  factory: ProviderFactory<Type, Context, Deps>
  dispose?: ProviderDispose<Type, Context, Deps>
  scope?: Scope
}

export interface ProviderDeclaration<
  Type = any,
  Context extends Extra = Extra,
  Deps extends Dependencies = Dependencies,
  Scope extends ProviderScope = ProviderScope
> extends Depender<Deps> {
  provider: Provider<Type, Context, Deps, Scope>
}

export interface ProcedureDeclaration<
  Deps extends Dependencies,
  Options extends Extra,
  Context extends Extra,
  Input,
  Response,
  Output
> extends Depender<Deps> {
  procedure: BaseProcedure<Deps, Options, Context, Input, Response, Output>
}

export type ExtractAppOptions<App> = App extends Application<
  any,
  any,
  infer AppOptions
>
  ? AppOptions
  : never

export type ExtractAppContext<App> = App extends Application<
  any,
  any,
  any,
  infer AppContext
>
  ? AppContext
  : never

export type ApplicationWorkerData = {
  applicationPath: string
  hasTaskRunners: boolean
} & ApplicationWorkerOptions

export type ApplicationWorkerOptions = {
  id: number
  type: WorkerType
  applicationOptions: ApplicationOptions
  workerOptions: any
}

export type Task<
  Context extends Extra,
  Deps extends Dependencies,
  Args extends any[],
  Response
> = (
  ctx: DependencyContext<Context, Deps> & { signal: AbortSignal },
  ...args: Args
) => Response

export interface TaskProvider<
  Context extends Extra = Extra,
  Deps extends Dependencies = Dependencies,
  Args extends any[] = any[],
  Response = any
> {
  handle: Task<Context, Deps, Args, Response>
  name?: string
  parse?: (
    args: string[],
    kwargs: Record<string, string | string[]>
  ) => Args | Readonly<Args>
}

export interface TaskDeclaration<
  Context extends Extra,
  Deps extends Dependencies,
  Args extends any[],
  Response
> extends Depender<Deps> {
  task: TaskProvider<Context, Deps, Args, Response>
}

export type TaskInterface<Res = any> = {
  result: Promise<Res>
  abort: (reason?: any) => void
}

export type TasksRunner = (
  signal: AbortSignal,
  name: string,
  ...args: any[]
) => Promise<any>
