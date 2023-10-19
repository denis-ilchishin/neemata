declare type ExcludeFunction<T> = T extends (...args: any[]) => any ? never : T

declare type AcceptAnythingExceptFunction =
  | Promise<ExcludeFunction<any>>
  | ExcludeFunction<any>

declare type Provider<Injections extends Dependencies = {}> = (
  inject: DependencyContext<Injections>
) => any

declare type Injection<T> = T | Promise<{ default: T }>

declare type WebSocketInterface = {
  id: string
  join: (roomId: string) => boolean
  leave: (roomId: string) => boolean
  send: (event: string, data: any) => void
  rooms: () => Map<string, Room>
}

declare type Room = {
  id: string
  websockets: Set<WebSocketInterface>
  publish: (event: string, data: any, exclude?: WebSocketInterface) => void
}

declare type InvokeOptions<Args = any[]> = {
  args?: Args
  executionTimeout?: number
  poolTimeout?: number
  capture?: boolean
}

declare type Async<T> = T | Promise<T>

declare type Context<
  I extends Dependencies,
  S extends import('@neemata/common').Scope,
  T
> = {
  factory: (
    inject: DependencyContext<I>,
    params: S extends typeof import('@neemata/common').Scope['Call']
      ? CallScopeParams
      : S extends typeof import('@neemata/common').Scope['Connection']
      ? Readonly<ConnectionScopeParams>
      : {}
  ) => Async<T>
  dispose?: (
    inject: DependencyContext<I>,
    value: T,
    params: S extends typeof import('@neemata/common').Scope['Call']
      ? CallScopeParams
      : S extends typeof import('@neemata/common').Scope['Connection']
      ? Readonly<ConnectionScopeParams>
      : {}
  ) => any
  scope?: S
}

declare type ErrorHandler = [
  new (...args: any[]) => Error,
  (
    error: Error,
    ctx: {
      procedureName: string
      transport: import('@neemata/common').Transport
      params: CallScopeParams<unknown>
    }
  ) => any
]

declare type ApplicationOptions = {
  procedures: string
  tasks?: string
  errorHandlers?: ErrorHandler[]
  applicationPath?: string
  port?: number
  hostname?: string
  https?: import('uWebSockets.js').AppOptions
  qsOptions?: import('qs').IParseOptions
  workers?: {
    number: number
    timeout: number
  }
  api?: {
    queue?: {
      concurrency: number
      size: number
      timeout: number
    }
  }
  logging?: {
    level: import('pino').Level
  }
}

declare type DefaultScopeParams = undefined

declare type ConnectionScopeParams = {
  /**
   * HTTP headers
   */
  headers: Record<string, string>

  /**
   * Parsed HTTP url query
   */
  query: any

  /**
   * Resolved proxy remote address (empty string if none)
   */
  proxyRemoteAddress: string

  /**
   * Resolved remote address (empty string if none)
   */
  remoteAddress: string
}

declare type WebSocketCallScopeParams = {
  /**
   * WebSocket interface (Ws transport only)
   */
  websocket: WebSocketInterface
}

declare type HttpCallScopeParams = {
  /**
   * HTTP method (Http transport only)
   */
  method: 'post' | 'get'

  /**
   * Set response HTTP header (Http transport only)
   */
  setHeader: (name: string, value: string) => void
}

declare type CallScopeParams<
  Transport extends import('@neemata/common').Transport = unknown
> = ConnectionScopeParams & {
  procedure: string
  transport: Transport
} & (Transport extends typeof import('@neemata/common').Transport['Ws']
    ? WebSocketCallScopeParams
    : Transport extends typeof import('@neemata/common').Transport['Http']
    ? HttpCallScopeParams
    : Partial<WebSocketCallScopeParams & HttpCallScopeParams>)

declare type Task<Injections extends Dependencies> = (
  inject: Omit<DependencyContext<Injections>, 'websockets'> & {
    signal: AbortSignal
  },
  ...args: any[]
) => any

declare type Guard = () => Async<boolean>

declare type DefineApplication = <T extends Partial<ApplicationOptions>>(
  app: T
) => T

declare type DefineTask = <
  D extends Dependencies = {},
  T extends Task<D> = Task<D>
>(
  task: T,
  nameOrDependencies?: string | D,
  dependencies?: D
) => TaskDefinition<D, T>

declare type DefineTask = <Deps extends Dependencies, Type>(
  task: Task<Deps, Type>,
  injections?: Deps
) => TaskDefinition<Deps, Task<Deps, Type>, Type>

declare type DefineContext = <
  Deps extends Dependencies,
  Scope extends import('@neemata/common').Scope,
  Type
>(
  context: Context<Deps, Scope, Type>,
  injections?: Deps
) => ContextDefinition<Deps, Context<Deps, Scope, Type>, Type>

declare type ResolvedDependencyInjection<
  T extends AnyContextDefinition | AnyProviderDefinition
> = T extends ProviderDefinition<infer D, infer Provider>
  ? Awaited<ReturnType<Provider>>
  : T extends ContextDefinition<infer D, infer C, infer Type>
  ? Awaited<Type>
  : never

declare type DependencyContext<Deps extends Dependencies = {}> = {
  injections: {
    [K in keyof Deps]: ResolvedDependencyInjection<Deps[K]>
  }
  websockets: Map<string, WebSocketInterface>
  logger: import('pino').Logger
  invoke: <
    TaskDeclaration extends AnyTaskDefinition,
    Task extends TaskDeclaration extends TaskDefinition<infer _, infer T>
      ? T
      : never,
    Arguments extends OmitFirst<Parameters<Task>>,
    HasArguments extends Arguments extends [] ? false : true
  >(
    task: TaskDeclaration,
    ...args: HasArguments extends false
      ? [InvokeOptions?]
      : [RequireProperty<InvokeOptions<Arguments>, 'args'>]
  ) => Promise<Awaited<ReturnType<Task>>>
}

declare type Procedure<
  Deps extends Dependencies,
  Input,
  Response,
  Output,
  Transport extends import('@neemata/common').Transport
> = {
  /**
   * @default ['post']
   */
  httpMethod?: Array<'post' | 'get'>
  transport?: Transport
  guards?: (
    ctx: DependencyContext<Deps>,
    data: unknown,
    params: Readonly<CallScopeParams<Transport>>
  ) => Array<Guard>
  input?: (
    ctx: DependencyContext<Deps>,
    data: unknown,
    params: Readonly<CallScopeParams<Transport>>
  ) => Input
  handle: (
    ctx: DependencyContext<Deps>,
    data: Awaited<Input>,
    params: Readonly<CallScopeParams<Transport>>
  ) => Response
  output?: (ctx: DependencyContext<Deps>, response: Awaited<Response>) => Output
}

declare type Dependencies = Record<
  string,
  AnyProviderDefinition | AnyContextDefinition
>

declare type ProcedureDefinition<
  Deps extends Dependencies,
  Procedure extends AnyProdecure
> = {
  procedure: Procedure
  dependencies: Deps
  injectableType: symbol
}

declare type ProviderDefinition<
  Deps extends Dependencies,
  Provider extends AnyProvider
> = {
  provider: Provider
  dependencies: Deps
  injectableType: symbol
}

declare type ContextDefinition<
  Deps extends Dependencies,
  Context extends AnyContext,
  Type
> = {
  context: Context
  dependencies: Deps
  injectableType: symbol
  type?: Type
}

declare type TaskDefinition<Deps extends Dependencies, Task extends AnyTask> = {
  task: Task
  name: string
  dependencies: Deps
  injectableType: symbol
}

declare type DefineProcedure = <
  Deps extends Dependencies,
  Input,
  Response,
  Output,
  Transport extends import('@neemata/common').Transport
>(
  procedure: Procedure<Deps, Input, Response, Output, Transport>,
  dependencies?: Deps
) => ProcedureDefinition<
  Deps,
  Procedure<Deps, Input, Response, Output, Transport>
>

declare type DefineProvider = <
  Deps extends Dependencies,
  T extends Provider<Deps>
>(
  provider: T,
  dependencies?: Deps
) => ProviderDefinition<Deps, T>

declare type AnyProdecure = Procedure<any, any, any, any, any>
declare type AnyProvider = Provider<any>
declare type AnyContext = Context<any, any, any>
declare type AnyTask = Task<any>

declare type AnyProdecureDefinition = ProcedureDefinition<any, AnyProdecure>
declare type AnyProviderDefinition = ProviderDefinition<any, AnyProvider>
declare type AnyContextDefinition = ContextDefinition<any, AnyContext, any>
declare type AnyTaskDefinition = TaskDefinition<any, AnyTask>

declare type AnyFunction = (...args: any[]) => any
declare type RequireProperty<T, K extends keyof T> = T & { [P in K]-?: T[P] }
declare type OmitFirst<T extends any[]> = T extends [any, ...infer R]
  ? R
  : never
