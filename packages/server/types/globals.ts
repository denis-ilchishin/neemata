export type DefineProcedure = <Input, Response, Output>(
  cb: Procedure<Input, Response, Output>
) => Procedure<Input, Response, Output>

export type Procedure<Input, Response, Output> = (
  inject: Inject,
  params: any
) => Asyncable<{
  input?: (data: any) => Input
  handle: (data: Awaited<Input>) => Response
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

export type Inject = {
  provider: <Factory extends ProviderFactory, T extends Provider<Factory>>(
    injection: T
  ) => Promise<Awaited<ReturnType<T>>>
  context: <C extends ReturnType<DefineContext>>(
    context: C
  ) => Promise<Awaited<C['type']>>
}

export type Asyncable<T> = T | Promise<T>

export type Context<
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
  contexts?: Context<any, any, any>[]
  errorHandlers?: ErrorHandler[]
}

export type ApplicationConfig = {
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
