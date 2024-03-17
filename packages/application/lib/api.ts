import { ApiError, ErrorCode } from '@neematajs/common'
import type { ApplicationOptions } from './application'
import {
  CALL_PROVIDER,
  CONNECTION_PROVIDER,
  type Container,
  type Dependencies,
  type DependencyContext,
  type Depender,
  Provider,
} from './container'
import type { Logger } from './logger'
import type { Registry } from './registry'
import type { BaseTransport, BaseTransportConnection } from './transport'
import type {
  AnyApplication,
  AnyProcedure,
  Async,
  CallFn,
  ConnectionFn,
  ConnectionProvider,
  ErrorClass,
  Extra,
  FilterFn,
  // Guard,
  GuardFn,
  InferSchemaInput,
  InferSchemaOutput,
  Merge,
  // Middleware,
  MiddlewareContext,
  MiddlewareFn,
} from './types'
import { merge } from './utils/functions'

export type AnyTransportClass = new (...args: any[]) => BaseTransport<any>

export type ResolvedProcedureContext<Deps extends Dependencies> =
  DependencyContext<Deps>

export type ProcedureOptionType<ProcedureDeps extends Dependencies, T> =
  | T
  | ((ctx: ResolvedProcedureContext<ProcedureDeps>) => Async<T>)

export type ProcedureHandlerType<
  ProcedureDeps extends Dependencies,
  ProcedureInput,
  ProcedureOutput,
  Response = ProcedureOutput extends never
    ? any
    : InferSchemaInput<ProcedureOutput>,
> = (
  ctx: ResolvedProcedureContext<ProcedureDeps>,
  data: InferSchemaOutput<ProcedureInput>,
) => Response

export class Procedure<
  App extends AnyApplication = AnyApplication,
  ProcedureDeps extends Dependencies = {},
  ProcedureInput = unknown,
  ProcedureOutput = unknown,
  ProcedureHandler extends ProcedureHandlerType<
    ProcedureDeps,
    ProcedureInput,
    ProcedureOutput
  > = ProcedureHandlerType<ProcedureDeps, ProcedureInput, ProcedureOutput>,
> implements Depender<ProcedureDeps>
{
  static override<T>(
    newProcedure: T,
    original: any,
    overrides: { [K in keyof Procedure]?: any } = {},
  ): T {
    // @ts-expect-error
    Object.assign(newProcedure, original, overrides)
    return newProcedure
  }

  _!: {
    input: ProcedureInput
    output: ProcedureOutput
    middlewares: AnyMiddleware[]
    guards: AnyGuard[]
    options: Extra
    timeout: number
    description: string
    tags: string[]
    transports: Map<AnyTransportClass, boolean>
  }
  name!: string
  readonly handler!: ProcedureHandler
  readonly timeout!: this['_']['timeout']
  readonly dependencies: ProcedureDeps = {} as ProcedureDeps
  readonly transports: this['_']['transports'] =
    new Map() as this['_']['transports']

  readonly input!: this['_']['input']
  readonly output!: this['_']['output']
  readonly parsers: { input?: BaseParser; output?: BaseParser } = {}

  readonly options: Extra = {}
  readonly guards: this['_']['guards'] = []
  readonly middlewares: this['_']['middlewares'] = []
  readonly middlewareEnabled = true

  readonly tags: this['_']['tags'] = []
  readonly description!: this['_']['description']

  withDependencies<Deps extends Dependencies>(dependencies: Deps) {
    const procedure = new Procedure<
      App,
      Merge<ProcedureDeps, Deps>,
      ProcedureInput,
      ProcedureOutput,
      ProcedureHandlerType<
        Merge<ProcedureDeps, Deps>,
        ProcedureInput,
        ProcedureOutput
      >
    >()
    return Procedure.override(procedure, this, {
      dependencies: merge(this.dependencies, dependencies),
    })
  }

  withInput<Input>(input: ProcedureOptionType<ProcedureDeps, Input>) {
    const procedure = new Procedure<
      App,
      ProcedureDeps,
      Input,
      ProcedureOutput,
      ProcedureHandlerType<ProcedureDeps, Input, ProcedureOutput>
    >()
    return Procedure.override(procedure, this, { input })
  }

  withOutput<Output>(output: Output) {
    const procedure = new Procedure<
      App,
      ProcedureDeps,
      ProcedureInput,
      Output,
      ProcedureHandlerType<ProcedureDeps, ProcedureInput, Output>
    >()
    return Procedure.override(procedure, this, { output })
  }

  withOptions(options: Extra) {
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
      ProcedureDeps,
      ProcedureInput,
      ProcedureOutput
    >,
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

  withName(name: string) {
    const procedure = new Procedure<
      App,
      ProcedureDeps,
      ProcedureInput,
      ProcedureOutput,
      ProcedureHandler
    >()
    return Procedure.override(procedure, this, { name })
  }

  withTransport(transport: AnyTransportClass, enabled: boolean) {
    const procedure = new Procedure<
      App,
      ProcedureDeps,
      ProcedureInput,
      ProcedureOutput,
      ProcedureHandler
    >()
    const transports = new Map(this.transports)
    transports.set(transport, enabled)
    return Procedure.override(procedure, this, { transports })
  }
}

export type ProcedureCallOptions = {
  transport: BaseTransport
  connection: BaseTransportConnection
  path: [AnyProcedure, ...AnyProcedure[]]
  procedure: AnyProcedure
  payload: any
  container: Container
}

const NotFound = (name: string) =>
  new ApiError(ErrorCode.NotFound, `Procedure ${name} not found`)

export class Api {
  connectionProvider?: ConnectionProvider<any, any>
  connectionFn?: ConnectionFn<any, any>
  parsers: {
    input?: BaseParser
    output?: BaseParser
  }

  constructor(
    private readonly application: {
      container: Container
      registry: Registry
      transports: Set<BaseTransport>
      logger: Logger
    },
    private readonly options: ApplicationOptions['api'],
  ) {
    if (options.parsers instanceof BaseParser) {
      this.parsers = {
        input: options.parsers,
        output: options.parsers,
      }
    } else {
      this.parsers = { ...options.parsers }
    }
  }

  find(name: string) {
    const procedure = this.application.registry.procedure(name)
    if (!procedure) throw NotFound(name)
    return procedure
  }

  async call(
    callOptions: ProcedureCallOptions,
    withMiddleware = callOptions.procedure.middlewareEnabled,
  ) {
    const { payload, transport, procedure, container, connection } = callOptions

    container.provide(
      CALL_PROVIDER,
      this.createNestedCall(callOptions) as CallFn,
    )
    container.provide(CONNECTION_PROVIDER, connection)

    try {
      this.handleTransport(transport, procedure)
      const handleProcedure = await this.createProcedureHandler(
        callOptions,
        withMiddleware,
      )
      return await handleProcedure(payload)
    } catch (error) {
      throw await this.handleFilters(error)
    }
  }

  private createNestedCall(callOptions: ProcedureCallOptions) {
    return (procedure: Procedure, payload: any) => {
      return this.call(
        {
          ...callOptions,
          path: [...callOptions.path, procedure],
          procedure,
          payload,
        },
        false,
      )
    }
  }

  private async createProcedureHandler(
    callOptions: ProcedureCallOptions,
    withMiddleware: boolean,
  ) {
    const { connection, path, procedure, container } = callOptions

    const middlewareCtx: MiddlewareContext = {
      connection,
      path,
      procedure,
      container,
    }

    const middlewares = await this.resolveMiddlewares(
      callOptions,
      withMiddleware,
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
        const context = await container.createContext(dependencies)

        // TODO: maybe disable input handling for nested calls or make it optional at least?
        const data = await this.handleSchema(
          procedure,
          'input',
          payload,
          context,
        )

        const result = await this.handleTimeout(
          procedure.handler(context, data),
          timeout,
        )

        try {
          return await this.handleSchema(procedure, 'output', result, context)
        } catch (cause) {
          const error = new Error(
            `Procedure [${procedure.name}] output error`,
            { cause },
          )
          this.application.logger.error(error)
          throw new ApiError(
            ErrorCode.InternalServerError,
            'Internal Server Error',
          )
        }
      }
    }

    return handleProcedure
  }

  private async resolveMiddlewares(
    callOptions: ProcedureCallOptions,
    withMiddleware: boolean,
  ) {
    if (!withMiddleware) return undefined
    const { procedure, container } = callOptions
    const middlewareProviders = [
      ...this.application.registry.middlewares,
      ...procedure.middlewares,
    ]
    const middlewares = await Promise.all(
      middlewareProviders.map((p) => container.resolve(p)),
    )
    return middlewares[Symbol.iterator]()
  }

  private handleTransport(transport: BaseTransport, procedure: AnyProcedure) {
    if (this.options.transports === 'any' && !procedure.transports.size) {
      return
    }

    for (const [transportClass, enabled] of procedure.transports.entries()) {
      if (transport instanceof transportClass) {
        if (!enabled) break
        if (enabled) return
      }
    }

    throw NotFound(procedure.name)
  }

  private handleTimeout(response: any, timeout?: number) {
    const withTimeout = (value: Promise<any>) =>
      new Promise((resolve, reject) => {
        const timeoutError = new ApiError(
          ErrorCode.RequestTimeout,
          'Request Timeout',
        )
        const timer = setTimeout(reject, timeout, timeoutError)
        const clearTimer = () => clearTimeout(timer)
        value.finally(clearTimer).then(resolve).catch(reject)
      })
    const applyTimeout = timeout && response instanceof Promise
    return applyTimeout ? withTimeout(response) : response
  }

  private async handleGuards(callOptions: ProcedureCallOptions) {
    const { procedure, container, path, connection } = callOptions
    const guards = await Promise.all(
      procedure.guards.map((p) => container.resolve(p)),
    )
    const guardOptions = Object.freeze({ connection, path })
    for (const guard of guards) {
      const result = await guard(guardOptions)
      if (result === false) throw new ApiError(ErrorCode.Forbidden)
    }
  }

  private async handleFilters(error: any) {
    if (this.application.registry.filters.size) {
      for (const [
        errorType,
        filter,
      ] of this.application.registry.filters.entries()) {
        if (error instanceof errorType) {
          const filterFn = await this.application.container.resolve(filter)
          const handledError = await filterFn(error)
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
    context: any,
  ) {
    const parser = procedure.parsers[type] ?? this.parsers[type]
    if (!parser) return payload
    const schema = procedure[type]
    if (!schema) return payload
    return parser!.parse(schema, payload, context)
  }
}

export class Guard<
  App extends AnyApplication = AnyApplication,
  Deps extends Dependencies = {},
> extends Provider<GuardFn<App>, Deps> {}
export type AnyGuard = Guard<AnyApplication, any>

export class Middleware<
  App extends AnyApplication = AnyApplication,
  Deps extends Dependencies = {},
> extends Provider<MiddlewareFn<App>, Deps> {}
export type AnyMiddleware = Middleware<AnyApplication, any>

export class Filter<Error extends ErrorClass = ErrorClass> extends Provider<
  FilterFn<Error>
> {}

export abstract class BaseParser {
  abstract parse(schema: any, data: any, ctx: any): any

  toJsonSchema(schema: any): any {
    return {}
  }
}
