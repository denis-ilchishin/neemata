// import { Transport } from '@neemata/common'?
import { Static, TSchema } from '@sinclair/typebox'
import { IncomingMessage } from 'http'
import { TypeOf, ZodType } from 'zod'
import { Client } from '../lib/protocol/client'

type Transport = null

export type Schemas = ZodType | TSchema
export type Scopes = 'call' | 'connection' | 'default'
export type Providers = keyof Omit<
  Injectables,
  `api${string}` | `task${string}`
>

export type Services = Exclude<
  Providers,
  keyof Omit<Injectables, `service${string}`>
>

export type Procedures = Exclude<
  keyof Injectables,
  keyof Omit<Injectables, `api${string}`>
>

export type Dependencies<P extends Providers = Providers> = {
  [K in P]?: boolean
}

export type Contexts = {
  call: { req: IncomingMessage; client: Client; procedure: string; auth?: Auth }
  connection: { req: IncomingMessage; client: Client; auth?: Auth }
  default: {}
}

export type ExtraContextType = any

export type Provider<
  Scope extends Scopes,
  Dependency extends Dependencies,
  ExtraContext extends any,
  T extends any
> = {
  scope: Scopes
  deps: Dependencies
  factory: InjectableFactory<Scope, Dependency, ExtraContext, T>
}

export type Promised<T> = T | Promise<T>

export type InjectableResolvedExports<K extends Extract<Providers, string>> =
  Injectables[Extract<Providers, K>]['exports']

export type InjectableResolvedFactory<
  I extends Provider<any, any, any, any> | never
> = I extends never ? never : Awaited<ReturnType<I['factory']>>

export type InjectableFactory<
  Scope extends Scopes,
  Dependency extends Dependencies,
  ExtraContext extends any,
  T extends any = any
> = (options: {
  deps: {
    [K in keyof Dependency as Dependency[K] extends true
      ? K
      : never]: InjectableResolvedFactory<
      Injectables[Extract<Providers, K>]['exports']
    >
  }
  ctx: (ExtraContext extends ExtraContextType ? ExtraContext : {}) &
    Contexts[Scope]
}) => Promised<T>

export type Injectable<
  Scope extends Scopes,
  Dependency extends Dependencies,
  ExtraContext extends any,
  T extends any
> =
  | InjectableFactory<'default', {}, ExtraContext, T>
  | {
      scope?: Scope
      deps?: Dependency
      factory: InjectableFactory<Scope, Dependency, ExtraContext, T>
      dispose?: (
        instance: Awaited<
          ReturnType<InjectableFactory<Scope, Dependency, ExtraContext, T>>
        >
      ) => any
    }

export type MiddlewareLike = () => any

export type OnlySpecificDependencies<
  RequiredProviderLike extends Provider<any, any, any, any>,
  RequiredProviderName extends Providers = Providers
> = {
  [K in RequiredProviderName as Injectables[Extract<
    Providers,
    K
  >]['exports'] extends RequiredProviderLike
    ? K
    : never]?: boolean
}

export type UnionToIntersection<U> = (
  U extends any ? (k: U) => void : never
) extends (k: infer I) => void
  ? I
  : never

export type Values<T> = T[keyof T]

export type AwaitedReturnType<T> = T extends (...any: []) => any
  ? Awaited<ReturnType<T>>
  : never

export type Merge<T, U> = U &
  Omit<T, keyof { [K in keyof U as U[K] extends never ? never : K]: U[K] }>

export type ExtractProps<T> = {
  [K in keyof T]: T[K][keyof T[K]]
}
export type IsEmpty<T> = keyof T extends never ? true : false
export type Resolve<T> = IsEmpty<T> extends false
  ? 'default' extends keyof T
    ? T['default']
    : never
  : never
export type ExtractMiddlewareExtraContext<Dependency extends Dependencies> =
  UnionToIntersection<
    Values<{
      [K in keyof Dependency as Dependency[K] extends true
        ? K
        : never]: Dependency[K] extends true
        ? AwaitedReturnType<
            InjectableResolvedFactory<
              Injectables[Extract<Providers, K>]['exports']
            >
          >
        : never
    }>
  >

export type MiddlewareDependencies = OnlySpecificDependencies<
  Provider<'call', any, any, MiddlewareLike>
>
export type ResolveSchemaType<Schema> = Schema extends TSchema
  ? Static<Schema>
  : Schema extends ZodType
  ? TypeOf<Schema>
  : unknown

export type NonPromise<T> = T extends Promise<infer U> ? U : T

export type IgnorePromise<T extends (...args: any[]) => any> = (
  ...args: Parameters<T>
) => NonPromise<ReturnType<T>>

export type WithoutPrefix<
  T,
  Prefix extends string
> = T extends `${Prefix}${infer P}` ? P : never
export type ResolvedApi<K extends Procedures> = Injectables[Extract<
  Procedures,
  K
>]['exports']
export type ResolveInput<K extends Procedures> = ResolvedApi<K>['input']
export type ResolveOutput<K extends Procedures> = ResolvedApi<K>['output']

export interface ProcedureDeclarationOptions<
  DependenciesOption extends Dependencies = Dependencies,
  MiddlewareOptions extends OnlySpecificDependencies<
    Provider<'call', any, any, MiddlewareLike>
  > = OnlySpecificDependencies<Provider<'call', any, any, MiddlewareLike>>,
  TransportOption extends Transport = Transport,
  AuthOption extends boolean = boolean
> {
  deps: DependenciesOption
  middleware: MiddlewareOptions
  transport: TransportOption
  timeout: number
  auth: AuthOption
}

export interface ProcedureOptions<
  InputOption extends Schemas,
  AuthOption extends boolean
> {
  input?: InputOption
  handler: (options: {
    data: InputOption
    auth: AuthOption extends true ? Auth : Auth | null
  }) => any
}

export type ResolveDependencies<Deps extends Dependencies> = {
  [K in keyof Deps as Deps[K] extends true
    ? K
    : never]: InjectableResolvedFactory<
    Injectables[Extract<Providers, K>]['exports']
  >
}

export type AuthProviderType = (options: {
  req: IncomingMessage
  client: Client
}) => Promised<Auth | null>
export type ProcedureHandler<Input> = (options: { data: Input }) => any

export interface Injectables {}
export interface Auth {}
export type ClientApi = {
  [K in Procedures as WithoutPrefix<
    Injectables[Extract<Procedures, K>]['alias'],
    'api/'
  >]: {
    input: ResolveInput<K>
    output: ResolveOutput<K>
  }
}
export class UserApplication {
  auth: keyof OnlySpecificDependencies<
    Provider<'default', any, any, AuthProviderType>,
    Services
  >

  declareProvider<
    Dependency extends Dependencies,
    T extends any,
    Scope extends Scopes = 'default'
  >(
    injectable: Injectable<Scope, Dependency, any, T>
  ): Provider<Scope, Dependency, any, T>

  declareAuthProvider<
    Dependency extends Dependencies,
    T extends AuthProviderType
  >(
    injectable: Injectable<'default', Dependency, any, T>
  ): Provider<'default', Dependency, any, T>

  declareMiddleware<Dependency extends Dependencies, T extends MiddlewareLike>(
    injectable: Injectable<'call', Dependency, any, T>
  ): Provider<'call', Dependency, any, T>

  declareProcedure<
    TDeclaredDependenciesOption extends Dependencies,
    TDeclaredMiddlewareOption extends MiddlewareDependencies,
    TDeclaredTransportOption extends Transport,
    TDeclaredAuthOption extends boolean
  >(
    options: Partial<
      ProcedureDeclarationOptions<
        TDeclaredDependenciesOption,
        TDeclaredMiddlewareOption,
        TDeclaredTransportOption,
        TDeclaredAuthOption
      >
    >
  ): <
    InputOption extends Schemas,
    OutputOption extends Schemas,
    FactoryOptions extends {
      deps: ResolveDependencies<
        Merge<TDeclaredDependenciesOption, TDependenciesOption>
      >
      ctx: ExtractMiddlewareExtraContext<
        Merge<TDeclaredDependenciesOption, TDependenciesOption>
      > &
        Contexts['call']
    },
    Output extends OutputOption extends ZodType
      ? Promised<OutputOption['_input']>
      : OutputOption extends TSchema
      ? Promised<Static<OutputOption>>
      : Response,
    Response extends any = any,
    TDependenciesOption extends Dependencies | TDeclaredDependenciesOption = {},
    TMiddlewareOption extends
      | MiddlewareDependencies
      | TDeclaredMiddlewareOption = {},
    TTransportOption extends Transport = TDeclaredTransportOption,
    TAuthOption extends boolean = TDeclaredAuthOption
  >(
    options: Partial<
      ProcedureDeclarationOptions<
        TDependenciesOption,
        TMiddlewareOption,
        TTransportOption,
        TAuthOption
      >
    > & {
      input?: ((options: FactoryOptions) => Promised<InputOption>) | InputOption
      output?:
        | ((options: FactoryOptions) => Promised<OutputOption>)
        | OutputOption
      handler: (
        options: FactoryOptions & {
          data: ResolveSchemaType<InputOption>
          auth: TAuthOption extends false ? Auth | null : Auth
        }
      ) => Promised<Output>
    }
  ) => {
    input: ResolveSchemaType<InputOption>
    output: Awaited<Output>
  }
}
