import type { Scope as ProviderScope } from '@neemata/common'
import type { Static, TSchema } from '@sinclair/typebox'
import type { TypeOf, ZodSchema } from 'zod'
import type { Api } from './api'
import type { Application } from './application'
import type { Container } from './container'
import type { Logger } from './logger'
import type { TaskDeclaration, TaskInterface } from './tasks'
import type { BaseTransport } from './transport'

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

export type Dependencies = Record<
  string,
  ProviderDeclaration | ProviderDeclarationWithOptions
>

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

export type ProcedureContext<Client extends BaseClient> = {
  client: Client
  call: <
    Declaration extends ProcedureDeclaration<any, any, any, any, any, any, any>
  >(
    declaration: Declaration,
    ...args: OmitFirstItem<Parameters<Declaration['procedure']['handle']>>
  ) => TaskInterface<Awaited<ReturnType<Declaration['procedure']['handle']>>>
}

export type Command = (
  options: {
    args: string[]
    kwargs: Record<string, any>
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
  Client extends BaseClient,
  Input,
  Response,
  Output
> = AsProcedureOptions<Options, DependencyContext<Context, Deps>> & {
  input?: Input | ((ctx: DependencyContext<Context, Deps>) => Input)
  handle: (
    ctx: DependencyContext<Context, Deps> & ProcedureContext<Client>,
    data: ProcedureDataType<Input>
  ) => Response
  output?:
    | Output
    | ((
        ctx: DependencyContext<Context, Deps>,
        data: Awaited<Response>
      ) => Output)
}

export interface ProcedureDeclaration<
  Deps extends Dependencies,
  Options extends Extra,
  Context extends Extra,
  Client extends BaseClient,
  Input,
  Response,
  Output
> extends Depender<Deps> {
  procedure: BaseProcedure<
    Deps,
    Options,
    Context,
    Client,
    Input,
    Response,
    Output
  >
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
  client: BaseClient
  name: string
  context: DependencyContext<Extra, {}>
  container: Container
  procedure: BaseProcedure<
    Dependencies,
    Options,
    Context,
    BaseClient,
    any,
    any,
    any
  >
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
  type: WorkerType
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
  _: {
    context: Context
    options: ProcedureOptions
  }
  context?(): Context
  install?(
    application: ExtensionInstallOptions<ProcedureOptions, Context>
  ): void
}

export type ResolveExtensionOptions<Extension> =
  Extension extends ExtensionInterface<infer Options> ? Options : {}

export type ResolveExtensionContext<Extension> =
  Extension extends ExtensionInterface<infer Options, infer Context>
    ? Context
    : {}

export type ResolveTransportClient<Transport> = Transport extends BaseTransport<
  any,
  any,
  infer Client
>
  ? Client
  : never

export type UnionToIntersection<U> = (
  U extends any ? (k: U) => void : never
) extends (k: infer I) => void
  ? I
  : never

export type ResolvedDependencyInjection<
  T extends ProviderDeclaration | ProviderDeclarationWithOptions
> = Awaited<
  T extends ProviderDeclaration<infer Type>
    ? Type
    : T extends ProviderDeclarationWithOptions<infer Type>
    ? Type
    : never
>

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
  Deps extends Dependencies,
  Options extends any
> = (ctx: DependencyContext<Context, Deps>, options?: Options) => Async<Type>

export type ProviderDispose<
  Type,
  Context extends Extra,
  Deps extends Dependencies
> = (ctx: DependencyContext<Context, Deps>, value: Type) => any

export type Provider<
  Type,
  Context extends Extra,
  Deps extends Dependencies,
  Scope extends ProviderScope,
  Options extends any
> = {
  factory: ProviderFactory<Type, Context, Deps, Options>
  dispose?: ProviderDispose<Type, Context, Deps>
  scope?: Scope
}

export interface ProviderDeclaration<
  Type = any,
  Context extends Extra = Extra,
  Deps extends Dependencies = Dependencies,
  Scope extends ProviderScope = ProviderScope,
  Options extends any = any
> extends Depender<Deps> {
  (options: Options): ProviderDeclarationWithOptions<
    Type,
    Context,
    Deps,
    Scope,
    Options
  >
  provider: Provider<Type, Context, Deps, Scope, Options>
}

export interface ProviderDeclarationWithOptions<
  Type = any,
  Context extends Extra = Extra,
  Deps extends Dependencies = Dependencies,
  Scope extends ProviderScope = ProviderScope,
  Options extends any = any
> extends Depender<Deps> {
  provider?: Provider<Type, Context, Deps, Scope, Options>
  options: Options
  declaration?: ProviderDeclaration
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

export type ExtractAppTransportClient<App> = App extends Application<
  any,
  any,
  any,
  any
>
  ? ResolveTransportClient<App['transport']>
  : never

export interface BaseClient<Data = any> {
  id: string
  send: (eventName: string, payload: any) => boolean
  data: Data
}
