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
import { BaseTransportClient } from './transport'
import {
  AnyApplication,
  Async,
  ClientProvider,
  ClientProviderFn,
  ExtensionMiddlewareOptions,
  GuardFn,
  InferSchema,
  MiddlewareFn,
  Scope,
} from './types'
import { merge } from './utils/functions'

export type ResolvedProcedureContext<
  App extends AnyApplication,
  Deps extends Dependencies
> = DependencyContext<App['_']['context'], Deps> & {
  client: App['_']['client']
  call: <P extends Procedure>(
    procedure: P,
    ...args: P['input'] extends unknown ? [] : [InferSchema<P['input']>]
  ) => Promise<
    Awaited<
      P['output'] extends unknown
        ? ReturnType<P['handler']>
        : InferSchema<P['output']>
    >
  >
}

export type ProcedureOptionType<
  App extends AnyApplication,
  ProcedureDeps extends Dependencies,
  T
> = T | ((ctx: ResolvedProcedureContext<App, ProcedureDeps>) => Async<T>)

export type ProcedureHandlerType<
  App extends AnyApplication,
  ProcedureDeps extends Dependencies,
  ProcedureInput
> = (
  this: Procedure,
  ctx: ResolvedProcedureContext<App, ProcedureDeps>,
  data: InferSchema<ProcedureInput>
) => any

export class Procedure<
  App extends AnyApplication = AnyApplication,
  ProcedureDeps extends Dependencies = {},
  ProcedureInput = unknown,
  ProcedureOutput = unknown,
  ProcedureHandler extends ProcedureHandlerType<
    App,
    ProcedureDeps,
    ProcedureInput
  > = ProcedureHandlerType<App, ProcedureDeps, ProcedureInput>
> implements Depender<ProcedureDeps>
{
  _!: {
    input: ProcedureInput
    output: ProcedureOutput
    middlewares: MiddlewareFn[]
    guards: GuardFn[]
    options: App['_']['options']
    timeout: number
  }

  dependencies!: ProcedureDeps
  handler!: ProcedureHandler
  timeout!: ProcedureOptionType<App, ProcedureDeps, this['_']['timeout']>
  input!: ProcedureOptionType<App, ProcedureDeps, this['_']['input']>
  output!: ProcedureOptionType<App, ProcedureDeps, this['_']['output']>
  options: ProcedureOptionType<App, ProcedureDeps, this['_']['options']>[] = []
  guards: ProcedureOptionType<App, ProcedureDeps, this['_']['guards']>[] = []
  middlewares: ProcedureOptionType<
    App,
    ProcedureDeps,
    this['_']['middlewares']
  >[] = []
  middlewareEnabled = true
  parsers: { input?: BaseParser; output?: BaseParser } = {}

  withDependencies<Deps extends Dependencies>(dependencies: Deps) {
    const procedure = new Procedure<
      App,
      ProcedureDeps & Deps,
      ProcedureInput,
      ProcedureOutput,
      ProcedureHandlerType<App, ProcedureDeps & Deps, ProcedureInput>
    >()
    Object.assign(procedure, this, {
      dependencies: merge(this.dependencies, dependencies),
    })
    return procedure
  }

  withInput<Input>(input: ProcedureOptionType<App, ProcedureDeps, Input>) {
    const procedure = new Procedure<
      App,
      ProcedureDeps,
      Input,
      ProcedureOutput,
      ProcedureHandlerType<App, ProcedureDeps, Input>
    >()
    Object.assign(procedure, this, { input })
    return procedure
  }

  withOutput<Output>(output: Output) {
    const procedure = new Procedure<
      App,
      ProcedureDeps,
      ProcedureInput,
      Output,
      ProcedureHandler
    >()
    Object.assign(procedure, this, { output })
    return procedure
  }

  withOptions(...options: this['options']) {
    const procedure = new Procedure<
      App,
      ProcedureDeps,
      ProcedureInput,
      ProcedureOutput,
      ProcedureHandler
    >()
    Object.assign(procedure, this, { options: [...this.options, ...options] })
    return procedure
  }

  withHandler<
    H extends ProcedureHandlerType<App, ProcedureDeps, ProcedureInput>
  >(handler: H) {
    const procedure = new Procedure<
      App,
      ProcedureDeps,
      ProcedureInput,
      ProcedureOutput,
      H
    >()
    Object.assign(procedure, this, { handler })
    return procedure
  }

  withGuards(...guards: this['guards']) {
    const procedure = new Procedure<
      App,
      ProcedureDeps,
      ProcedureInput,
      ProcedureOutput,
      ProcedureHandler
    >()
    Object.assign(procedure, this, {
      guards: [...this.guards, ...guards],
    })
    return procedure
  }

  withMiddlewares(...middlewares: this['middlewares']) {
    const procedure = new Procedure<
      App,
      ProcedureDeps,
      ProcedureInput,
      ProcedureOutput,
      ProcedureHandler
    >()
    Object.assign(procedure, this, {
      middlewares: [...this.middlewares, ...middlewares],
    })
    return procedure
  }

  withMiddlewareEnabled(enabled: boolean) {
    const procedure = new Procedure<
      App,
      ProcedureDeps,
      ProcedureInput,
      ProcedureOutput,
      ProcedureHandler
    >()
    Object.assign(procedure, this, { middlewareEnabled: enabled })
    return procedure
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
    Object.assign(procedure, this, { timeout })
    return procedure
  }

  withParser(parser: BaseParser) {
    const procedure = new Procedure<
      App,
      ProcedureDeps,
      ProcedureInput,
      ProcedureOutput,
      ProcedureHandler
    >()
    Object.assign(procedure, this, {
      parsers: { input: parser, output: parser },
    })
    return procedure
  }

  withInputParser(parser: BaseParser) {
    const procedure = new Procedure<
      App,
      ProcedureDeps,
      ProcedureInput,
      ProcedureOutput,
      ProcedureHandler
    >()
    Object.assign(procedure, this, {
      parsers: { ...this.parsers, input: parser },
    })
    return procedure
  }

  withOutputParser(parser: BaseParser) {
    const procedure = new Procedure<
      App,
      ProcedureDeps,
      ProcedureInput,
      ProcedureOutput,
      ProcedureHandler
    >()
    Object.assign(procedure, this, {
      parsers: { ...this.parsers, output: parser },
    })
    return procedure
  }
}

type ProcedureCallOptions = {
  client: BaseTransportClient
  name: string
  procedure: Procedure
  payload: any
  container: Container
}

const NotFound = (name: string) =>
  new ApiError(ErrorCode.NotFound, `Procedure ${name} not found`)

export class Api extends Loader<Procedure> {
  clientProvider?: ClientProvider<any, any>
  clientProviderFn?: ClientProviderFn<any, any>
  events: Record<string, Event> = {}
  throttleQueues = new Map<string, any[]>()
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
    const { client, container, procedure, payload } = callOptions
    const { dependencies } = procedure

    const nestedCall = this.createNestedCall(callOptions)
    const callContext = { client, call: nestedCall }

    const context = await container.createContext(dependencies, callContext)
    const handleProcedure = await this.createProcedureHandler(
      callOptions,
      context,
      withMiddleware
    )

    try {
      return await handleProcedure(payload)
    } catch (error) {
      throw this.handleFilters(error, context)
    }
  }

  registerProcedure(name: string, procedure: Procedure) {
    this.modules.set(name, procedure)
  }

  async getClientData(data: any) {
    return this.clientProviderFn?.(data)
  }

  async load(): Promise<void> {
    await super.load()

    if (!this.clientProvider) {
      this.application.logger.warn('Client provider is not defined')
    } else if (getProviderScope(this.clientProvider) !== Scope.Global) {
      throw new Error(
        "Client provider must be a Global scope (including all it's dependencies)"
      )
    } else {
      this.clientProviderFn = await this.application.container.resolve(
        this.clientProvider!
      )
    }
  }

  async resolveProcedureOption<
    P extends Procedure,
    O extends Extract<
      keyof P,
      'input' | 'output' | 'options' | 'guards' | 'middlewares' | 'timeout'
    >
  >(procedure: P, option: O, context: any): Promise<P['_'][O]> {
    const resolve = async (optionVal) => {
      if (typeof optionVal === 'function') {
        return await optionVal(context)
      }
      return optionVal
    }

    switch (option) {
      case 'input':
      case 'output':
      case 'timeout':
        return resolve(procedure[option as 'input' | 'output' | 'timeout'])
      case 'options':
        return merge(
          ...(await Promise.all(
            procedure[option as 'options'].map((v) => resolve(v))
          ))
        )
      case 'guards':
      case 'middlewares':
        return (
          await Promise.all(
            procedure[option as 'guards' | 'middlewares'].map(resolve)
          )
        ).flat()
      default:
        throw new Error(`Unknown procedure option ${option}`)
    }
  }

  protected set(name: string, path: string, module: any): void {
    this.application.logger.debug('Resolve [%s] procedure', name, path)
    super.set(name, path, module)
  }

  private createNestedCall(callOptions: ProcedureCallOptions) {
    return (procedure: Procedure, payload: any) => {
      const name = this.names.get(procedure)!
      return this.call({ ...callOptions, name, procedure, payload }, false)
    }
  }

  private async createProcedureHandler(
    callOptions: ProcedureCallOptions,
    context: any,
    withMiddleware: boolean
  ) {
    const { client, name, procedure, container } = callOptions

    const middlewareOptions: ExtensionMiddlewareOptions<any, any> = {
      client,
      name,
      context,
      procedure,
      container,
    }

    const middlewares = await this.resolveMiddlewares(
      callOptions,
      context,
      withMiddleware
    )

    let timeout =
      (await this.resolveProcedureOption(procedure, 'timeout', context)) ??
      this.options.timeout

    const handleProcedure = async (payload) => {
      const middleware = middlewares?.next().value
      if (middleware) {
        const next = (newPayload = payload) => handleProcedure(newPayload)
        return middleware(middlewareOptions, next, payload)
      } else {
        await this.handleGuards(callOptions, context)
        // TODO: maybe disable schema handling for nested calls or make it optional at least?
        const data = await this.handleSchema(
          procedure,
          'input',
          payload,
          context
        )

        const response = procedure.handler.call(procedure, context, data)
        const applyTimeout = timeout && response instanceof Promise
        const result = await (applyTimeout
          ? this.handleTimeout(response, timeout)
          : response)
        try {
          const output = await this.handleSchema(
            procedure,
            'output',
            result,
            context
          )
          return output
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
    context: any,
    withMiddleware: boolean
  ) {
    if (!withMiddleware) return undefined

    const procedureMiddlewares = await this.resolveProcedureOption(
      procedure,
      'middlewares',
      context
    )

    const rawMiddlewares = [
      ...this.application.middlewares,
      ...procedureMiddlewares,
    ]

    const middlewares: MiddlewareFn[] = Array(rawMiddlewares.length)

    for (let i = 0; i < rawMiddlewares.length; i++) {
      const rawMiddleware = rawMiddlewares[i]
      if (rawMiddleware instanceof Provider) {
        middlewares[i] = await container.resolve(rawMiddleware)
      } else {
        middlewares[i] = rawMiddleware
      }
    }

    return middlewares[Symbol.iterator]()
  }

  private handleTimeout<T>(value: Promise<T>, timeout: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeoutError = new ApiError(
        ErrorCode.RequestTimeout,
        'Request Timeout'
      )
      const timer = setTimeout(reject, timeout, timeoutError)
      const clearTimer = () => clearTimeout(timer)
      value.finally(clearTimer).then(resolve).catch(reject)
    })
  }

  private async handleGuards(callOptions: ProcedureCallOptions, context: any) {
    const { procedure, container } = callOptions
    const guards = await this.resolveProcedureOption(
      procedure,
      'guards',
      context
    )
    for (const rawGuard of guards) {
      const guard =
        rawGuard instanceof Provider
          ? await container.resolve(rawGuard)
          : rawGuard
      const result = await guard()
      if (result === false) throw new ApiError(ErrorCode.Forbidden)
    }
  }

  private handleFilters(error: any, context: any) {
    if (this.application.filters.size) {
      for (const [errorType, filter] of this.application.filters.entries()) {
        if (error instanceof errorType) {
          const handledError = filter(error, context)
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
    const schema = await this.resolveProcedureOption(procedure, type, context)
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
