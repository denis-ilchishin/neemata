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

// type NonPromise<T> = T extends Promise<infer U> ? U : T;
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
  T
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
  Omit<T, keyof { [K in keyof U as U[K] extends undefined ? never : K]: U[K] }>

export type ExtractProps<T> = {
  [K in keyof T]: T[K][keyof T[K]]
}

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

export type ResolveSchemaType<Schema> = Schema extends TSchema
  ? Static<Schema>
  : Schema extends ZodType
  ? TypeOf<Schema>
  : unknown

export type ProcedureHandlerOptions<
  InputOption extends Schemas,
  AuthOption extends boolean
> = {
  data: ResolveSchemaType<InputOption>
  auth: AuthOption extends false ? Auth | null : Auth
}

type NonPromise<T> = T extends Promise<infer U> ? U : T

type IgnorePromise<T extends (...args: any[]) => any> = (
  ...args: Parameters<T>
) => NonPromise<ReturnType<T>>

export type ProcedureHandler<
  Response extends any,
  InputOption extends Schemas,
  // OutputOption extends Schemas,
  AuthOption extends boolean
> = (
  options: ProcedureHandlerOptions<InputOption, AuthOption>
) => Promised<Response>

export interface ProcedureOptions<
  Response extends any,
  InputOption extends Schemas,
  OutputOption extends Schemas,
  AuthOption extends boolean,
  TransportOption extends Transport
> {
  input?: InputOption
  // output?: OutputOption
  handler: ProcedureHandler<Response, InputOption, AuthOption>
}

export interface ProcedureDeclarationOptions<
  Response extends any,
  Dependency extends Dependencies,
  Middleware extends Dependencies,
  AuthOption extends boolean,
  TransportOption extends Transport,
  InputOption extends Schemas,
  OutputOption extends Schemas,
  DeclaredDependency extends Dependencies,
  DeclaredMiddleware extends Dependencies
> {
  deps?: Dependency
  middleware?: Middleware
  transport?: TransportOption
  timeout?: number
  auth?: AuthOption
  factory: InjectableFactory<
    'call',
    Merge<DeclaredDependency, Dependency>,
    ExtractMiddlewareExtraContext<Merge<DeclaredMiddleware, Middleware>>,
    ProcedureOptions<
      Response,
      InputOption,
      OutputOption,
      AuthOption,
      TransportOption
    >
  >
}

export interface Procedure<
  Response extends any,
  Dependency extends Dependencies,
  Middleware extends Dependencies,
  AuthOption extends boolean,
  TransportOption extends Transport,
  InputOption extends Schemas,
  OutputOption extends Schemas,
  DeclaredDependency extends Dependencies,
  DeclaredMiddleware extends Dependencies
> extends ProcedureDeclarationOptions<
    Response,
    Dependency,
    Middleware,
    AuthOption,
    TransportOption,
    InputOption,
    OutputOption,
    DeclaredDependency,
    DeclaredMiddleware
  > {}

export interface ProcedureDeclaration<
  Dependency extends Dependencies,
  Middleware extends Dependencies,
  AuthOption extends boolean,
  TransportOption extends Transport
> extends Omit<
    ProcedureDeclarationOptions<
      never,
      Dependency,
      Middleware,
      AuthOption,
      TransportOption,
      never,
      never,
      {},
      {}
    >,
    'factory'
  > {}

export class UserApplication {
  auth: keyof OnlySpecificDependencies<
    Provider<'connection', any, any, () => Promise<Auth | null> | Auth | null>,
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
    T extends () => Promise<Auth | null> | Auth | null
  >(
    injectable: Injectable<'connection', Dependency, any, T>
  ): Provider<'connection', Dependency, any, T>

  declareMiddleware<Dependency extends Dependencies, T extends MiddlewareLike>(
    injectable: Injectable<'call', Dependency, any, T>
  ): Provider<'call', Dependency, any, T>

  declareProcedure<
    DeclaredTransportOption extends Transport,
    DeclaredDependency extends Dependencies = Omit<Dependencies, string>,
    DeclaredMiddleware extends OnlySpecificDependencies<
      Provider<'call', any, any, MiddlewareLike>
    > = Omit<Dependencies, string>,
    DeclaredAuthOption extends boolean = true
  >(
    options: Partial<
      ProcedureDeclaration<
        DeclaredDependency,
        DeclaredMiddleware,
        DeclaredAuthOption,
        DeclaredTransportOption
      >
    >
  ): <
    Response extends any = any,
    InputOption extends Schemas = never,
    OutputOption extends Schemas = never,
    Dependency extends Dependencies = DeclaredDependency | Dependencies,
    Middleware extends OnlySpecificDependencies<
      Provider<'call', any, any, MiddlewareLike>
    > =
      | DeclaredMiddleware
      | OnlySpecificDependencies<Provider<'call', any, any, MiddlewareLike>>,
    AuthOption extends boolean = DeclaredAuthOption,
    TransportOption extends Transport = DeclaredTransportOption
  >(
    options: Procedure<
      Response,
      Dependency,
      Middleware,
      AuthOption,
      TransportOption,
      InputOption,
      OutputOption,
      DeclaredDependency,
      DeclaredMiddleware
    >
  ) => Procedure<
    Response,
    Dependency,
    Middleware,
    AuthOption,
    TransportOption,
    InputOption,
    OutputOption,
    DeclaredDependency,
    DeclaredMiddleware
  >
}

export interface Injectables {}

export interface Auth {}
export type WithoutPrefix<
  T,
  Prefix extends string
> = T extends `${Prefix}${infer P}` ? P : never

export type TypeIfNotUndefined<T> = T extends undefined ? never : T

export type ResolvedApiFactory<K extends Procedures> = Awaited<
  ReturnType<Injectables[Extract<Procedures, K>]['exports']['factory']>
>

export type AwaitedReturnType2<T> = T extends (...args: any) => any
  ? Awaited<ReturnType<T>>
  : never

export type ClientApi = {
  [K in Procedures as WithoutPrefix<
    Injectables[Extract<Procedures, K>]['alias'],
    'api/'
  >]: {
    input: ResolveSchemaType<Required<ResolvedApiFactory<K>>['input']>
    output: Awaited<ReturnType<ResolvedApiFactory<K>['handler']>>
  }
}
