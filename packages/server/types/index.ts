export type DefineProcedure = <Input, Response, Output>(
  cb: Procedure<Input, Response, Output>
) => Procedure<Input, Response, Output>

export type Procedure<Input, Response, Output> = (
  inject: Inject,
  params: CallScopeParams
) => Async<{
  input?: (data: any) => Input
  handle: (
    data: Awaited<Input>,
    extra: { setHeader?: (name: string, value: string) => void }
  ) => Response
  output?: (response: Awaited<Response>) => Output
}>

export type ProviderFactory = (inject: Inject) => any
export type DefineProvider = <Factory extends ProviderFactory>(
  provider: Provider<Factory>
) => Provider<Factory>

export type ExcludeFunction<T> = T extends (...args: any[]) => any ? never : T
export type AcceptAnythingExceptFunction =
  | Promise<ExcludeFunction<any>>
  | ExcludeFunction<any>

export type Provider<Factory extends (inject: Inject) => any> = Factory

export type Injection<T> = T | Promise<{ default: T }>

export type WebSocketInterface = {
  id: string
  join: (room: string) => boolean
  leave: (room: string) => boolean
  publish: (room: string, event: string, data: any) => boolean
  send: (event: string, data: any) => void
  rooms: () => string[]
}

export type Inject = {
  provider: <Factory extends ProviderFactory, T extends Provider<Factory>>(
    injection: T
  ) => Promise<Awaited<ReturnType<T>>>
  context: <C extends ReturnType<DefineContext>>(
    context: C
  ) => Promise<Awaited<C['type']>>
  websockets: Map<string, WebSocketInterface>
  logger: import('pino').Logger
  invoke: <T extends Task, H extends Awaited<ReturnType<T['factory']>>>(
    task: T,
    args: Parameters<H>[0]
  ) => Promise<Awaited<ReturnType<H>>>
}

export type Async<T> = T | Promise<T>

export type Context<
  DefaultType = undefined,
  ConnectionType = DefaultType,
  CallType = ConnectionType
> = {
  call?: (
    inject: Inject,
    value: ConnectionType,
    params: CallScopeParams
  ) => Async<CallType>
  connection?: (
    inject: Inject,
    value: DefaultType,
    params: ConnectionScopeParams
  ) => Async<ConnectionType>
  default?: (inject: Inject) => Async<DefaultType>
  dispose?: (
    inject: Inject,
    value: DefaultType | ConnectionType | CallType
  ) => any
}

export type DefineContext = <
  DefaultType = undefined,
  ConnectionType = DefaultType,
  CallType = ConnectionType
>(
  cb: Context<DefaultType, ConnectionType, CallType>
) => Context<DefaultType, ConnectionType, CallType> & {
  type: DefaultType | ConnectionType | CallType
}

export type ErrorHandler = [ErrorConstructor, (error: Error) => any]

export type ApplicationDeclaration = {
  config: ApplicationConfig
  procedures: string | Record<string, Procedure<any, any, any>>
  tasks?: Task[]
  contexts?: Context<any, any, any>[]
  errorHandlers?: ErrorHandler[]
}

export type ApplicationConfig = {
  /**
   * Must be the path of exported application. Required for tasker to work.
   *
   * @example import.meta.url
   */
  applicationPath: string
  port?: number
  hostname?: string
  https?: import('uWebSockets.js').AppOptions
  basePath?: string
  qsOptions?: import('qs').IParseOptions
  tasker?: {
    workers: number
    timeout: number
  }
  rpc?: {
    /**
     * Maximum number of concurrent calls execution
     */
    concurrency: number
    /**
     * Maximum number of calls in queue
     */
    size: number
    /**
     * Queue timeout in milliseconds
     */
    timeout: number
  }
  logging?: {
    level?: import('pino').Level
  }
}

export type DefaultScopeParams = undefined

export type ConnectionScopeParams = {
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

export type CallScopeParams = ConnectionScopeParams & {
  transport: import('@neemata/common').Transport

  /**
   * WebSocket interface (Ws transport only)
   */
  websocket?: WebSocketInterface

  /**
   * HTTP method (Http transport only)
   */
  method?: string

  /**
   * Set response HTTP header (Http transport only)
   */
  setHeader?: (name: string, value: string) => void
}

export type Application = {
  start: () => Promise<void>
  stop: () => Promise<void>
  container: import('../lib/container').Container
}

export type Task = {
  name: string
  factory: (
    inject: Omit<Inject, 'websockets'>
  ) => Async<(args: any, ab: AbortController) => any>
}

export type DefineTask = <T extends Task>(cb: T) => T

export type DefineApplication = <T extends ApplicationDeclaration>(app: T) => T
