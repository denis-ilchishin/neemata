import { ApiError, ErrorCode } from '@neematajs/common'
import { boolean } from 'zod'
import type { ApplicationOptions } from './application'
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
} from './common'
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
import { merge, withTimeout } from './utils/functions'

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

export type ApplyProcedureTransport<
  T extends AnyTransportClass[],
  D extends Dependencies,
> = {
  [K in keyof D]: D[K] extends typeof CONNECTION_PROVIDER
    ? Provider<
        BaseTransportConnection & InstanceType<T[number]>['_']['connection']
      >
    : D[K]
}

export class Procedure<
  ProcedureDeps extends Dependencies = {},
  ProcedureInput = unknown,
  ProcedureOutput = unknown,
  ProcedureTransports extends AnyTransportClass[] = [],
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
    transports: ProcedureTransports
  }

  readonly handler!: ProcedureHandler
  readonly timeout!: this['_']['timeout']
  readonly dependencies: ProcedureDeps = {} as ProcedureDeps
  readonly transports = new Set<AnyTransportClass>()
  readonly input!: this['_']['input']
  readonly output!: this['_']['output']
  readonly parsers: { input?: BaseParser; output?: BaseParser } = {}
  readonly options: Extra = {}
  readonly guards: this['_']['guards'] = []
  readonly middlewares: this['_']['middlewares'] = []

  withDependencies<Deps extends Dependencies>(dependencies: Deps) {
    const procedure = new Procedure<
      Merge<ProcedureDeps, ApplyProcedureTransport<ProcedureTransports, Deps>>,
      ProcedureInput,
      ProcedureOutput,
      ProcedureTransports,
      ProcedureHandlerType<
        Merge<
          ProcedureDeps,
          ApplyProcedureTransport<ProcedureTransports, Deps>
        >,
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
      ProcedureDeps,
      Input,
      ProcedureOutput,
      ProcedureTransports,
      ProcedureHandlerType<ProcedureDeps, Input, ProcedureOutput>
    >()
    return Procedure.override(procedure, this, { input })
  }

  withOutput<Output>(output: Output) {
    const procedure = new Procedure<
      ProcedureDeps,
      ProcedureInput,
      Output,
      ProcedureTransports,
      ProcedureHandlerType<ProcedureDeps, ProcedureInput, Output>
    >()
    return Procedure.override(procedure, this, { output })
  }

  withOptions(options: Extra) {
    const procedure = new Procedure<
      ProcedureDeps,
      ProcedureInput,
      ProcedureOutput,
      ProcedureTransports,
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
      ProcedureDeps,
      ProcedureInput,
      ProcedureOutput,
      ProcedureTransports,
      H
    >()
    return Procedure.override(procedure, this, { handler })
  }

  withGuards(...guards: this['guards']) {
    const procedure = new Procedure<
      ProcedureDeps,
      ProcedureInput,
      ProcedureOutput,
      ProcedureTransports,
      ProcedureHandler
    >()
    return Procedure.override(procedure, this, {
      guards: [...this.guards, ...guards],
    })
  }

  withMiddlewares(...middlewares: this['middlewares']) {
    const procedure = new Procedure<
      ProcedureDeps,
      ProcedureInput,
      ProcedureOutput,
      ProcedureTransports,
      ProcedureHandler
    >()
    return Procedure.override(procedure, this, {
      middlewares: [...this.middlewares, ...middlewares],
    })
  }

  withTimeout(timeout: number) {
    if (typeof timeout !== 'number' || timeout < 0)
      throw new Error('Timeout must be a positive number')
    const procedure = new Procedure<
      ProcedureDeps,
      ProcedureInput,
      ProcedureOutput,
      ProcedureTransports,
      ProcedureHandler
    >()
    return Procedure.override(procedure, this, { timeout })
  }

  withParser(parser: BaseParser) {
    const procedure = new Procedure<
      ProcedureDeps,
      ProcedureInput,
      ProcedureOutput,
      ProcedureTransports,
      ProcedureHandler
    >()
    return Procedure.override(procedure, this, {
      parsers: { input: parser, output: parser },
    })
  }

  withInputParser(parser: BaseParser) {
    const procedure = new Procedure<
      ProcedureDeps,
      ProcedureInput,
      ProcedureOutput,
      ProcedureTransports,
      ProcedureHandler
    >()
    return Procedure.override(procedure, this, {
      parsers: { ...this.parsers, input: parser },
    })
  }

  withOutputParser(parser: BaseParser) {
    const procedure = new Procedure<
      ProcedureDeps,
      ProcedureInput,
      ProcedureOutput,
      ProcedureTransports,
      ProcedureHandler
    >()
    return Procedure.override(procedure, this, {
      parsers: { ...this.parsers, output: parser },
    })
  }

  withTransport<T extends AnyTransportClass>(transport: T) {
    const procedure = new Procedure<
      ProcedureDeps,
      ProcedureInput,
      ProcedureOutput,
      [...ProcedureTransports, T],
      ProcedureHandler
    >()
    const transports = new Set(this.transports)
    transports.add(transport)
    return Procedure.override(procedure, this, { transports })
  }
}

export type ProcedureCallOptions = {
  name: string
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
      logger: Logger
      transports: Set<BaseTransport>
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
    try {
      return this.application.registry.getByName('procedure', name)
    } catch (error) {
      throw NotFound(name)
    }
  }

  async call(callOptions: ProcedureCallOptions, nested = false) {
    const { payload, container, connection } = callOptions

    const callNested = this.createCallNested(callOptions) as CallFn

    container.provide(CALL_PROVIDER, callNested)
    container.provide(CONNECTION_PROVIDER, connection)

    try {
      this.handleTransport(callOptions)
      const handleProcedure = await this.createProcedureHandler(
        callOptions,
        nested,
      )
      return await handleProcedure(payload)
    } catch (error) {
      throw await this.handleFilters(error)
    }
  }

  private createCallNested(callOptions: ProcedureCallOptions) {
    return (procedure: Procedure, payload: any) => {
      return this.call(
        {
          ...callOptions,
          path: [...callOptions.path, procedure],
          procedure,
          payload,
        },
        true,
      )
    }
  }

  private async createProcedureHandler(
    callOptions: ProcedureCallOptions,
    nested: boolean,
  ) {
    const { name, connection, path, procedure, container } = callOptions

    const middlewareCtx: MiddlewareContext = {
      name,
      connection,
      path,
      procedure,
      container,
    }

    const middlewares = nested
      ? undefined
      : await this.resolveMiddlewares(callOptions)

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
          const error = new Error(`Procedure [${name}] output error`, { cause })
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

  private async resolveMiddlewares(callOptions: ProcedureCallOptions) {
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

  private handleTransport({
    procedure,
    transport,
    name,
  }: ProcedureCallOptions) {
    for (const transportClass of procedure.transports) {
      if (transport instanceof transportClass) return
    }

    throw NotFound(name)
  }

  private handleTimeout(response: any, timeout?: number) {
    const applyTimeout = timeout && response instanceof Promise
    const error = new ApiError(ErrorCode.RequestTimeout, 'Request Timeout')
    return applyTimeout ? withTimeout(response, timeout, error) : response
  }

  private async handleGuards(callOptions: ProcedureCallOptions) {
    const { procedure, container, path, connection } = callOptions
    const providers = [...this.application.registry.guards, ...procedure.guards]
    const guards = await Promise.all(providers.map((p) => container.resolve(p)))
    const guardOptions = Object.freeze({ connection, path })
    for (const guard of guards) {
      const result = await guard(guardOptions)
      if (result === false) throw new ApiError(ErrorCode.Forbidden)
    }
  }

  private async handleFilters(error: any) {
    if (this.application.registry.filters.size) {
      for (const [errorType, filter] of this.application.registry.filters) {
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

export class Guard<Deps extends Dependencies = {}> extends Provider<
  GuardFn,
  Deps
> {}
export type AnyGuard = Guard<any>

export class Middleware<Deps extends Dependencies = {}> extends Provider<
  MiddlewareFn,
  Deps
> {}
export type AnyMiddleware = Middleware<any>

export class Filter<Error extends ErrorClass = ErrorClass> extends Provider<
  FilterFn<Error>
> {}

export abstract class BaseParser {
  abstract parse(schema: any, data: any, ctx: any): any

  toJsonSchema(schema: any): any {
    return {}
  }
}
