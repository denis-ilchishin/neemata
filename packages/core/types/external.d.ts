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
    Provider<'connection', any, any, Promise<Auth | null> | Auth | null>,
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
    T extends Promise<Auth | null> | Auth | null
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

// export type]

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

// // type x = { a: true } | { a: false }
// // type z = x['a']
// // export interface ProcedureHandlerOptions<
// //   D extends TSchema | ZodType,
// //   T extends Transport,
// //   A extends boolean,
// //   P = A extends false ? null | Auth : Auth
// // > {
// //   data: D extends TSchema ? Static<D> : D extends ZodType ? TypeOf<D> : unknown
// //   req: Readonly<IncomingMessage>
// //   client: Readonly<
// //     T extends typeof Transport.Http
// //       ? HttpClient<P>
// //       : T extends typeof Transport.Ws
// //       ? WsClient<P>
// //       : Client<P>
// //   >
// // }

// // export type ProcedureHandler<
// //   D extends TSchema | ZodType,
// //   T extends Transport,
// //   A extends boolean,
// //   R extends any
// // > = (options: ProcedureHandlerOptions<D, T, A>) => R

// // export interface Procedure<
// //   D extends TSchema | ZodType,
// //   T extends Transport,
// //   A extends boolean,
// //   R extends any
// // > {
// //   /**
// //    * Endpoint's handler
// //    */
// //   handler: ProcedureHandler<D, T, A, R>
// //   /**
// //    * Yup schema to validate endpoint's body against
// //    */
// //   schema?: D
// //   /**
// //    * Whether current endpoint is available only for authenticated users or not
// //    * @default true
// //    */
// //   auth?: A
// //   /**
// //    * Collection of endpoint guards. Evaluated after authentication
// //    */
// //   guards?: Guard[]
// //   /**
// //    * Restrict endpoint to be accessible via only one transport
// //    */
// //   transport?: T
// //   /**
// //    * Execution timeout for current endpoint
// //    */
// //   timeout?: number
// //   /**
// //    * Whether current endpoint is introspectable from client application or not
// //    * @default true
// //    */
// //   introspectable?: boolean | 'guards' | Guard
// // }

// // export interface UserApplication {
// //   clients: Set<WsClient<Auth | null>>
// //   createFileLogger: (
// //     name: string,
// //     level?: import('pino').Level
// //   ) => import('pino').BaseLogger
// //   worker: {
// //     type: WorkerType
// //     workerId: number
// //     threadId: number
// //   }
// //   invoke: <K extends keyof Tasks>(
// //     task: K | { task: K; timeout: number },
// //     ...args: Parameters<Tasks[K]>
// //   ) => Promise<Awaited<ReturnType<Tasks[K]>>>
// // }

// // export interface Auth {}

// // export interface Tasks {}
// // export interface Injections {}

// // export interface Hooks {
// //   [WorkerHook.Startup]?: () => Promise<any>
// //   [WorkerHook.Shutdown]?: () => Promise<any>
// //   [WorkerHook.Call]?: (
// //     options: Readonly<{
// //       data?: any
// //       client: Client<Auth | null>
// //       req: IncomingMessage
// //       procedure: { name: string; version: string }
// //     }>
// //   ) => Promise<any>
// //   [WorkerHook.Connect]?: (
// //     options: Readonly<{
// //       client: WsClient<Auth | null>
// //       req: IncomingMessage
// //     }>
// //   ) => Promise<any>
// //   [WorkerHook.Disconnect]?: (
// //     options: Readonly<{
// //       client: WsClient<Auth | null>
// //       req: IncomingMessage
// //     }>
// //   ) => Promise<any>
// // }

// // export type DefineAuthService = <
// //   T extends (options: {
// //     session: string
// //     req: IncomingMessage
// //   }) => Promise<Auth | null>
// // >(
// //   service: T
// // ) => T
// // export type DefineGuard = (guard: Guard) => Guard
// // export type DefineProcedure = <
// //   D extends TSchema | ZodType,
// //   T extends Transport,
// //   A extends boolean = true,
// //   R extends any = any
// // >(
// //   procedure: Procedure<D, T, A, R>
// // ) => Procedure<D, T, A, R>

// // export declare type Guard = (options: {
// //   readonly req: import('node:http').IncomingMessage
// //   readonly client: Client<Auth | null>
// // }) => boolean | Promise<boolean>

// // export declare interface HttpClient<Auth = unknown, T = typeof Transport.Http> {
// //   readonly id: string
// //   readonly auth: Auth
// //   readonly session: string
// //   readonly transport: T
// //   readonly clearSession: () => void
// // }

// // export declare interface WsClient<Auth = unknown>
// //   extends HttpClient<Auth, typeof Transport.Ws> {
// //   readonly send: (event: string, data?: any) => void
// //   readonly openedAt: Date
// //   readonly closedAt?: Date
// // }

// // export declare type Client<Auth = unknown> = HttpClient<Auth> | WsClient<Auth>

// // export type StreamTypeOptions = { maximum?: number }

// declare global {
//   // const ErrorCode: typeof import('@neemata/common').ErrorCode
//   // const WorkerType: typeof import('@neemata/common').WorkerType
//   // class Stream extends Readable {
//   //   meta: {
//   //     size: number
//   //     type: string
//   //     name?: string
//   //   }
//   //   done(): Promise<void>
//   //   toBuffer(): Promise<Buffer>
//   // }
//   // class ApiException {
//   //   constructor(options: {
//   //     code: string | number
//   //     data?: any
//   //     message?: string
//   //   })
//   // }
//   // const application: UserApplication
//   // const hooks: Hooks
//   // const lib: Lib
//   // const config: Config
//   // const services: Services
//   // const db: Db
//   // const defineProcedure: DefineProcedure
//   // const defineAuthService: DefineAuthService
//   // const defineGuard: DefineGuard
//   // const dependency: <T extends keyof Injections>(
//   //   ...dependencies: T[]
//   // ) => Promise<void>
//   // const Typebox: typeof import('@sinclair/typebox') &
//   //   typeof import('@sinclair/typebox/compiler') &
//   //   typeof import('@sinclair/typebox/conditional') &
//   //   typeof import('@sinclair/typebox/custom') &
//   //   typeof import('@sinclair/typebox/errors') &
//   //   typeof import('@sinclair/typebox/format') &
//   //   typeof import('@sinclair/typebox/guard') &
//   //   typeof import('@sinclair/typebox/hash') &
//   //   typeof import('@sinclair/typebox/system') &
//   //   typeof import('@sinclair/typebox/value') & {
//   //     Stream: (
//   //       options?: Partial<StreamTypeOptions>
//   //     ) => import('@sinclair/typebox').TUnsafe<Stream>
//   //   }
//   // const zod: typeof import('zod') & {
//   //   stream: (
//   //     options?: Partial<StreamTypeOptions>
//   //   ) => import('zod').ZodType<Stream>
//   // }
// }
// type myFunc = <Response, Output>(options: {
//   output?: Output
//   handler: () => Output extends never ? Response : Output
// }) => {
//   output: Output
//   handler: () => Output extends never ? Response : Output
// }

// type SomeFunc<Response, Output = {}> = (options: {
//   output?: Output;
//   handler: () => Output extends {} ? Output : Response;
// }) => Output extends {} ? Output : Response;

// type MyFunction<Response, Output> = SomeFunc<Response, Output> & ((options: { output?: Output, handler: () => Output }) => Output extends never ? Response : Output);

// type myFunction =MyFunction<string, number> = (options) => {
//   if (options.output !== undefined) {
//     return options.output + 1; // Output is number
//   } else {
//     return "default"; // Output is never, so return Response type (string)
//   }
// };

// type A = MyFunction<string, number>

// type B = ReturnType<A>
