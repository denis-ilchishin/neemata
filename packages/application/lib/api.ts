import { ApiError, ErrorCode } from '@neemata/common'
import { ApplicationOptions } from './application'
import {
  Container,
  Dependencies,
  DependencyContext,
  Depender,
  Provider,
  getProviderScope,
} from './container'
import { Loader } from './loader'
import { BaseTransportConnection } from './transport'
import {
  AnyApplication,
  Async,
  ConnectionFn,
  ConnectionProvider,
  Guard,
  InferSchemaInput,
  InferSchemaOutput,
  Middleware,
  MiddlewareContext,
  Scope,
} from './types'
import { merge } from './utils/functions'

export type ResolvedProcedureContext<
  App extends AnyApplication,
  Deps extends Dependencies
> = DependencyContext<
  App['_']['context'] & {
    connection: App['_']['connection']
    call: <P extends Procedure>(
      procedure: P,
      ...args: P['input'] extends unknown ? [] : [InferSchemaOutput<P['input']>]
    ) => Promise<
      Awaited<
        P['output'] extends unknown
          ? ReturnType<P['handler']>
          : InferSchemaOutput<P['output']>
      >
    >
  },
  Deps
>

export type ProcedureOptionType<
  App extends AnyApplication,
  ProcedureDeps extends Dependencies,
  T
> = T | ((ctx: ResolvedProcedureContext<App, ProcedureDeps>) => Async<T>)

export type ProcedureHandlerType<
  App extends AnyApplication,
  ProcedureDeps extends Dependencies,
  ProcedureInput,
  ProcedureOutput,
  Response = ProcedureOutput extends never
    ? any
    : InferSchemaInput<ProcedureOutput>
> = (
  ctx: ResolvedProcedureContext<App, ProcedureDeps>,
  data: InferSchemaOutput<ProcedureInput>
) => Response

export class Procedure<
  App extends AnyApplication = AnyApplication,
  ProcedureDeps extends Dependencies = {},
  ProcedureInput = unknown,
  ProcedureOutput = unknown,
  ProcedureHandler extends ProcedureHandlerType<
    App,
    ProcedureDeps,
    ProcedureInput,
    ProcedureOutput
  > = ProcedureHandlerType<App, ProcedureDeps, ProcedureInput, ProcedureOutput>
> implements Depender<ProcedureDeps>
{
  static override<T extends Procedure>(
    newProcedure: T,
    original: any,
    overrides: { [K in keyof Procedure]?: any } = {}
  ): T {
    Object.assign(newProcedure, original, overrides)
    return newProcedure
  }

  _!: {
    input: ProcedureInput
    output: ProcedureOutput
    middlewares: Middleware[]
    guards: Guard[]
    options: App['_']['options']
    timeout: number
    description: string
    tags: string[]
  }

  handler!: ProcedureHandler
  dependencies!: ProcedureDeps
  timeout!: this['_']['timeout']

  input!: this['_']['input']
  output!: this['_']['output']
  parsers: { input?: BaseParser; output?: BaseParser } = {}

  options: this['_']['options'] = {}
  guards: this['_']['guards'] = []
  middlewares: this['_']['middlewares'] = []
  middlewareEnabled = true

  tags: this['_']['tags'] = []
  description!: this['_']['description']

  withDependencies<Deps extends Dependencies>(dependencies: Deps) {
    const procedure = new Procedure<
      App,
      ProcedureDeps & Deps,
      ProcedureInput,
      ProcedureOutput,
      ProcedureHandlerType<
        App,
        ProcedureDeps & Deps,
        ProcedureInput,
        ProcedureOutput
      >
    >()
    return Procedure.override(procedure, this, {
      dependencies: merge(this.dependencies, dependencies),
    })
  }

  withInput<Input>(input: ProcedureOptionType<App, ProcedureDeps, Input>) {
    const procedure = new Procedure<
      App,
      ProcedureDeps,
      Input,
      ProcedureOutput,
      ProcedureHandlerType<App, ProcedureDeps, Input, ProcedureOutput>
    >()
    return Procedure.override(procedure, this, { input })
  }

  withOutput<Output>(output: Output) {
    const procedure = new Procedure<
      App,
      ProcedureDeps,
      ProcedureInput,
      Output,
      ProcedureHandlerType<App, ProcedureDeps, ProcedureInput, Output>
    >()
    return Procedure.override(procedure, this, { output })
  }

  withOptions(options: this['options']) {
    const procedure = new Procedure<
      App,
      ProcedureDeps,
      ProcedureInput,
      ProcedureOutput,
      ProcedureHandler
    >()
    return Procedure.override(procedure, this, {
      options: merge(this.options, options),
    })
  }

  withHandler<
    H extends ProcedureHandlerType<
      App,
      ProcedureDeps,
      ProcedureInput,
      ProcedureOutput
    >
  >(handler: H) {
    const procedure = new Procedure<
      App,
      ProcedureDeps,
      ProcedureInput,
      ProcedureOutput,
      H
    >()
    return Procedure.override(procedure, this, { handler })
  }

  withGuards(...guards: this['guards']) {
    const procedure = new Procedure<
      App,
      ProcedureDeps,
      ProcedureInput,
      ProcedureOutput,
      ProcedureHandler
    >()
    return Procedure.override(procedure, this, {
      guards: [...this.guards, ...guards],
    })
  }

  withMiddlewares(...middlewares: this['middlewares']) {
    const procedure = new Procedure<
      App,
      ProcedureDeps,
      ProcedureInput,
      ProcedureOutput,
      ProcedureHandler
    >()
    return Procedure.override(procedure, this, {
      middlewares: [...this.middlewares, ...middlewares],
    })
  }

  withMiddlewareEnabled(enabled: boolean) {
    const procedure = new Procedure<
      App,
      ProcedureDeps,
      ProcedureInput,
      ProcedureOutput,
      ProcedureHandler
    >()
    return Procedure.override(procedure, this, { middlewareEnabled: enabled })
  }

  withTimeout(timeout: number) {
    if (typeof timeout !== 'number' || timeout < 0)
      throw new Error('Timeout must be a positive number')
    const procedure = new Procedure<
      App,
      ProcedureDeps,
      ProcedureInput,
      ProcedureOutput,
      ProcedureHandler
    >()
    return Procedure.override(procedure, this, { timeout })
  }

  withParser(parser: BaseParser) {
    const procedure = new Procedure<
      App,
      ProcedureDeps,
      ProcedureInput,
      ProcedureOutput,
      ProcedureHandler
    >()
    return Procedure.override(procedure, this, {
      parsers: { input: parser, output: parser },
    })
  }

  withInputParser(parser: BaseParser) {
    const procedure = new Procedure<
      App,
      ProcedureDeps,
      ProcedureInput,
      ProcedureOutput,
      ProcedureHandler
    >()
    return Procedure.override(procedure, this, {
      parsers: { ...this.parsers, input: parser },
    })
  }

  withOutputParser(parser: BaseParser) {
    const procedure = new Procedure<
      App,
      ProcedureDeps,
      ProcedureInput,
      ProcedureOutput,
      ProcedureHandler
    >()
    return Procedure.override(procedure, this, {
      parsers: { ...this.parsers, output: parser },
    })
  }

  withDescription(description: string) {
    const procedure = new Procedure<
      App,
      ProcedureDeps,
      ProcedureInput,
      ProcedureOutput,
      ProcedureHandler
    >()
    return Procedure.override(procedure, this, { description })
  }

  withTags(...tags: string[]) {
    const procedure = new Procedure<
      App,
      ProcedureDeps,
      ProcedureInput,
      ProcedureOutput,
      ProcedureHandler
    >()
    return Procedure.override(procedure, this, {
      tags: [...this.tags, ...tags],
    })
  }
}

type ProcedureCallOptions = {
  connection: BaseTransportConnection
  name: string
  procedure: Procedure
  payload: any
  container: Container
}

const NotFound = (name: string) =>
  new ApiError(ErrorCode.NotFound, `Procedure ${name} not found`)

export class Api extends Loader<Procedure> {
  connection?: ConnectionProvider<any, any>
  connectionFn?: ConnectionFn<any, any>
  parsers: {
    input?: BaseParser
    output?: BaseParser
  }

  constructor(
    private readonly application: AnyApplication,
    readonly options: ApplicationOptions['api']
  ) {
    super(options.path ?? '')
    if (options.parsers instanceof BaseParser) {
      this.parsers = {
        input: options.parsers,
        output: options.parsers,
      }
    } else {
      this.parsers = { ...options.parsers }
    }
  }

  async find(name: string) {
    const procedure = this.modules.get(name)
    if (!procedure) throw NotFound(name)
    return procedure
  }

  async call(
    callOptions: ProcedureCallOptions,
    withMiddleware = callOptions.procedure.middlewareEnabled
  ) {
    const { payload } = callOptions

    const handleProcedure = await this.createProcedureHandler(
      callOptions,
      withMiddleware
    )

    try {
      return await handleProcedure(payload)
    } catch (error) {
      throw this.handleFilters(error)
    }
  }

  registerProcedure(name: string, procedure: Procedure) {
    this.set(name, procedure)
  }

  async getConnectionData(data: any) {
    return this.connectionFn?.(data)
  }

  async load(): Promise<void> {
    await super.load()

    if (!this.connection) {
      this.application.logger.warn('Connection provider is not defined')
    } else if (getProviderScope(this.connection) !== Scope.Global) {
      throw new Error(scopeErrorMessage('Connection'))
    } else {
      this.connectionFn = await this.application.container.resolve(
        this.connection!
      )
    }
  }

  protected set(name: string, procedure: Procedure, path?: string): void {
    if (typeof procedure.handler === 'undefined')
      throw new Error('Procedure handler is not defined')

    if (this.modules.has(name))
      throw new Error(`Procedure ${name} already registered`)

    if (hasNonInvalidScopeDeps(procedure.guards))
      throw new Error(scopeErrorMessage('Guard'))

    if (hasNonInvalidScopeDeps(procedure.middlewares))
      throw new Error(scopeErrorMessage('Middleware'))

    this.application.logger.debug('Resolve [%s] procedure', name)
    super.set(name, procedure, path)
  }

  private createNestedCall(callOptions: ProcedureCallOptions) {
    return (procedure: Procedure, payload: any) => {
      const name = this.names.get(procedure)!
      return this.call({ ...callOptions, name, procedure, payload }, false)
    }
  }

  private async createProcedureHandler(
    callOptions: ProcedureCallOptions,
    withMiddleware: boolean
  ) {
    const { connection, name, procedure, container } = callOptions

    const middlewareCtx: MiddlewareContext = {
      connection,
      name,
      procedure,
      container,
    }

    const middlewares = await this.resolveMiddlewares(
      callOptions,
      withMiddleware
    )

    const { timeout = this.options.timeout } = procedure

    const handleProcedure = async (payload) => {
      const middleware = middlewares?.next().value
      if (middleware) {
        const next = (newPayload = payload) => handleProcedure(newPayload)
        return middleware(middlewareCtx, next, payload)
      } else {
        await this.handleGuards(callOptions)
        const { dependencies } = procedure
        const nestedCall = this.createNestedCall(callOptions)
        const context = await container.createContext(dependencies, {
          connection,
          call: nestedCall,
        })

        // TODO: maybe disable input handling for nested calls or make it optional at least?
        const data = await this.handleSchema(
          procedure,
          'input',
          payload,
          context
        )

        const result = await this.handleTimeout(
          procedure.handler(context, data),
          timeout
        )

        try {
          return await this.handleSchema(procedure, 'output', result, context)
        } catch (cause) {
          const error = new Error(`Procedure [${name}] output error`, { cause })
          this.application.logger.error(error)
          throw new ApiError(
            ErrorCode.InternalServerError,
            'Internal Server Error'
          )
        }
      }
    }

    return handleProcedure
  }

  private async resolveMiddlewares(
    { procedure, container }: ProcedureCallOptions,
    withMiddleware: boolean
  ) {
    if (!withMiddleware) return undefined
    const middlewareProviders = [
      ...this.application.middlewares,
      ...procedure.middlewares,
    ]
    const middlewares = await Promise.all(
      middlewareProviders.map((p) => container.resolve(p))
    )
    return middlewares[Symbol.iterator]()
  }

  private handleTimeout(response: any, timeout?: number) {
    const withTimeout = (value: Promise<any>) =>
      new Promise((resolve, reject) => {
        const timeoutError = new ApiError(
          ErrorCode.RequestTimeout,
          'Request Timeout'
        )
        const timer = setTimeout(reject, timeout, timeoutError)
        const clearTimer = () => clearTimeout(timer)
        value.finally(clearTimer).then(resolve).catch(reject)
      })
    const applyTimeout = timeout && response instanceof Promise
    return applyTimeout ? withTimeout(response) : response
  }

  private async handleGuards(callOptions: ProcedureCallOptions) {
    const { procedure, container, name, connection } = callOptions
    const guards = await Promise.all(
      procedure.guards.map((p) => container.resolve(p))
    )
    const guardOptions = Object.freeze({ connection, name })
    for (const guard of guards) {
      const result = await guard(guardOptions)
      if (result === false) throw new ApiError(ErrorCode.Forbidden)
    }
  }

  private handleFilters(error: any) {
    if (this.application.filters.size) {
      for (const [errorType, filter] of this.application.filters.entries()) {
        if (error instanceof errorType) {
          const handledError = filter(error)
          if (!handledError || !(handledError instanceof ApiError)) continue
          return handledError
        }
      }
    }
    return error
  }

  private async handleSchema(
    procedure: Procedure,
    type: 'input' | 'output',
    payload: any,
    context: any
  ) {
    const parser = procedure.parsers[type] ?? this.parsers[type]
    if (!parser) return payload
    const schema = procedure[type]
    if (!schema) return payload
    return parser!.parse(schema, payload, context)
  }
}

export abstract class BaseParser {
  abstract parse(schema: any, data: any, ctx: any): any

  toJsonSchema(schema: any): any {
    return {}
  }
}

const scopeErrorMessage = (name, scope = 'Global') =>
  `${name} provider must be a ${scope} scope (including all it's dependencies)`

const hasNonInvalidScopeDeps = (providers: Provider[], scope = Scope.Global) =>
  providers.some((guard) => getProviderScope(guard) !== scope)
