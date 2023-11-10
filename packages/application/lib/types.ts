import { Scope } from '@neemata/common'
import { Api } from './api'
import { Container } from './container'
import { Logger } from './logger'

export type OmitFirstItem<T extends any[]> = T extends [any, ...infer U]
  ? U
  : []

export type ApplicationOptions = {
  logging?: {
    level: import('pino').Level
  }
  loader?: {
    procedures?: string
  }
}
export type Extra = Record<string, any>

export const Hook = {
  Start: 'Start',
  Stop: 'Stop',
  Middleware: 'Middleware',
} as const
export type Hook = (typeof Hook)[keyof typeof Hook]

export type Dependencies = Record<string, ProviderDeclaration>

export interface LoaderInterface<T> {
  modules: Map<string, T>
}

export type Async<T> = T | Promise<T>

export type ProcedureOption<T, Context extends Extra = {}, Data = unknown> =
  | T
  | ((context: Context, data: Data) => Async<T>)

export type ProcedureContext = {
  call: <Declaration extends ProcedureDeclaration<any, any, any, any, any>>(
    declaration: Declaration,
    ...args: OmitFirstItem<Parameters<Declaration['procedure']['handle']>>
  ) => Promise<ReturnType<Declaration['procedure']['handle']>>
}

export type Command = (options: {
  args: any[]
  kwargs: Record<string, string>
}) => any
export type Middleware = (
  options: ExtensionMiddlewareOptions,
  payload: any,
  next: Next
) => any

export type BaseProcedure<
  Deps extends Dependencies,
  Options extends Extra,
  Context extends Extra,
  Data,
  Response
> = AsProcedureOptions<Options, DependencyContext<Context, Deps>> & {
  handle: (
    ctx: DependencyContext<Context, Deps> & ProcedureContext,
    data: Data
  ) => Response
}

export interface Depender<Deps extends Dependencies> {
  dependencies: Deps
}

export type AsProcedureOptions<
  Options extends Extra = {},
  Context extends Extra = {}
> = {
  [K in keyof Options]: ProcedureOption<Options[K], Context, unknown>
}

export type ExtensionMiddlewareOptions<
  Options extends Extra = {},
  Context extends Extra = {}
> = {
  name: string
  context: DependencyContext<Extra, {}>
  container: Container<Depender<Dependencies>, Context>
  procedure: BaseProcedure<Dependencies, Options, Context, any, any>
}

export type Next = (payload?: any) => any

export interface ExtensionInstallOptions<
  Options extends Extra = {},
  Context extends Extra = {}
> {
  api: Api<Options, Context>
  container: Container<Depender<Dependencies>, Context>
  logger: Logger

  registerHook(hook: typeof Hook.Start, cb: () => any): void
  registerHook(hook: typeof Hook.Stop, cb: () => any): void
  registerHook(hook: typeof Hook.Middleware, cb: Middleware): void
  registerCommand(command: string, cb: Command): void
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

export type DependencyContext<
  Context extends Extra,
  Deps extends Dependencies
> = {
  injections: {
    [K in keyof Deps]: ResolvedDependencyInjection<Deps[K]>
  }
  logger: Logger
  scope: Scope
} & Context

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
  Skope extends Scope
> = {
  factory: ProviderFactory<Type, Context, Deps>
  dispose?: ProviderDispose<Type, Context, Deps>
  scope?: Skope
}

export interface ProviderDeclaration<
  Type = unknown,
  Context extends Extra = {},
  Deps extends Dependencies = {},
  Skope extends Scope = Scope
> extends Depender<Deps> {
  provider: Provider<Type, Context, Deps, Skope>
}

export interface ProcedureDeclaration<
  Deps extends Dependencies,
  Options extends Extra,
  Context extends Extra,
  Data,
  Response
> extends Depender<Deps> {
  procedure: BaseProcedure<Deps, Options, Context, Data, Response>
}
