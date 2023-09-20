declare type DefineProcedure = <Input, Response, Output>(
  cb: Procedure<Input, Response, Output>
) => Procedure<Input, Response, Output>

declare type Procedure<Input, Response, Output> = (
  inject: Inject,
  params: any
) => Asyncable<{
  input?: (data: any) => Input
  handle: (data: Awaited<Input>) => Response
  output?: (response: Awaited<Response>) => Output
}>

declare type ProviderFactory = (inject: Inject) => any
declare type DefineProvider = <Factory extends ProviderFactory>(
  provider: Provider<Factory>
) => Provider<Factory>

declare type ExcludeFunction<T> = T extends (...args: any[]) => any ? never : T
declare type AcceptAnythingExceptFunction =
  | Promise<ExcludeFunction<any>>
  | ExcludeFunction<any>

declare type Provider<Factory extends (inject: Inject) => any> = Factory

declare type Injection<T> = T | Promise<{ default: T }>

declare type Inject = {
  provider: <Factory extends ProviderFactory, T extends Provider<Factory>>(
    injection: T
  ) => Promise<Awaited<ReturnType<T>>>
  context: <C extends ReturnType<DefineContext>>(
    context: C
  ) => Promise<Awaited<C['type']>>
}

declare type Asyncable<T> = T | Promise<T>

declare type Context<
  DefaultType = undefined,
  ConnectionType = DefaultType,
  CallType = ConnectionType
> = {
  call?: (inject: Inject, value: ConnectionType, ctx: {}) => Asyncable<CallType>
  connection?: (
    inject: Inject,
    value: DefaultType,
    ctx: {}
  ) => Asyncable<ConnectionType>
  default?: (inject: Inject) => Asyncable<DefaultType>
  dispose?: (
    inject: Inject,
    value: DefaultType | ConnectionType | CallType
  ) => any
}

declare type DefineContext = <
  DefaultType = undefined,
  ConnectionType = DefaultType,
  CallType = ConnectionType
>(
  cb: Context<DefaultType, ConnectionType, CallType>
) => Context<DefaultType, ConnectionType, CallType> & {
  type: DefaultType | ConnectionType | CallType
}

declare type ErrorHandler = [ErrorConstructor, (error: Error) => any]

declare type ApplicationDeclaration = {
  config: ApplicationConfig
  procedures: string | Record<string, Procedure<any, any, any>>
  contexts?: Context<any, any, any>[]
  errorHandlers?: ErrorHandler[]
}

declare type ApplicationConfig = {
  port: number
  hostname?: string
  https?: boolean
  basePath?: string
  qsOptions?: import('qs').IParseOptions
  rpc?: {
    concurrency?: number
    queueSize?: number
    queueTimeout?: number
  }
}
