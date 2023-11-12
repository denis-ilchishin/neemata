import { ApiError, ErrorCode } from '@neemata/common'
import { Container } from './container'

import { Loader } from './loader'
import { Logger } from './logger'

import {
  ApplicationOptions,
  BaseProcedure,
  Dependencies,
  Extra,
  Filters,
  Middleware,
  Middlewares,
  ProcedureDeclaration,
} from './types'
import { match, merge } from './utils'

const NotFound = (name: string) =>
  new ApiError(ErrorCode.NotFound, `Procedure ${name} not found`)

const MIDDLEWARE_ENABLED = Symbol('middlware')

export abstract class BaseParser {
  abstract parse(schema: any, data: any): any

  toJsonSchema(schema: any): any {
    return {}
  }
}

export class Api<
  Options extends Extra = {},
  Context extends Extra = {},
  T extends ProcedureDeclaration<
    Dependencies,
    Options,
    Context,
    any,
    any,
    any
  > = ProcedureDeclaration<Dependencies, Options, Context, any, any, any>
> extends Loader<T> {
  constructor(
    private readonly options: ApplicationOptions['api'],
    private readonly logger: Logger,
    private readonly middlewares: Middlewares,
    private readonly filters: Filters,
    readonly parser: BaseParser = options?.parser
  ) {
    super(options?.path)
  }

  protected set(name: string, path: string, module: any): void {
    this.logger.info('Resolve [%s] procedure', name, path)
    super.set(name, path, module)
  }

  async find(name: string) {
    const declaration = this.modules.get(name)
    if (!declaration) throw NotFound(name)
    return declaration
  }

  async call(
    name: string,
    declaration: T,
    payload: any,
    container: Container,
    callContext: Extra,
    withMiddleware = declaration[MIDDLEWARE_ENABLED]
  ) {
    let middlewars = withMiddleware ? this.findMiddlewares(name) : undefined
    const { dependencies, procedure } = declaration
    const call = (declaration, payload) =>
      this.call(name, declaration, payload, container, callContext, false)
    const context = await container.context(dependencies, { call }, callContext)
    const handleProcedure = async (payload) => {
      const middleware: Middleware | undefined = middlewars?.next()?.value
      if (middleware) {
        const options = { name, context, procedure, container }
        const next = (newPayload = payload) => handleProcedure(newPayload)
        return middleware(options, payload, next)
      } else {
        // TODO: maybe disable schema handling for nested calls?
        const data = await this.handleInput(procedure, context, payload)
        return procedure.handle(context, data)
      }
    }

    try {
      const response = await handleProcedure(payload)
      return this.handleOutput(procedure, context, response)
    } catch (error) {
      throw this.handleFilters(error)
    }
  }

  declareProcedure<Deps extends Dependencies, Input, Response, Output>(
    procedure: BaseProcedure<Deps, Options, Context, Input, Response, Output>,
    dependencies?: Deps,
    enableMiddleware = true
  ): ProcedureDeclaration<Deps, Options, Context, Input, Response, Output> {
    const declaration = { procedure, dependencies }
    declaration[MIDDLEWARE_ENABLED] = enableMiddleware
    return declaration
  }

  registerProcedure(name: string, declaration: T, enableHooks = true) {
    // prevent override of original declaration, e.g if it was made by declareProcedure method
    declaration = merge(declaration, { [MIDDLEWARE_ENABLED]: enableHooks })
    this.modules.set(name, declaration)
  }

  private findMiddlewares(name: string) {
    const set: Middleware[] = []
    for (const [pattern, middlewares] of this.middlewares) {
      if (match(name, pattern)) set.push(...middlewares)
    }
    return set[Symbol.iterator]()
  }

  private handleFilters(error: any) {
    if (this.filters.size) {
      for (const [errorType, filter] of this.filters.entries()) {
        if (error instanceof errorType) {
          const handledError = filter(error)
          if (!handledError || !(handledError instanceof ApiError)) continue
          return handledError
        }
      }
    }
    return error
  }

  private async handleInput(procedure, context, payload) {
    if (!this.parser) return payload
    const schema = await this.getProcedureSchema(procedure, context, 'input')
    if (!schema) return payload
    return this.parser.parse(schema, payload)
  }

  private async handleOutput(procedure, context, response) {
    if (!this.parser) return response
    const schema = await this.getProcedureSchema(procedure, context, 'output')
    if (!schema) return response
    return this.parser.parse(schema, response)
  }

  getProcedureSchema(procedure, context, type: 'input' | 'output') {
    return typeof procedure[type] === 'function'
      ? procedure[type](context)
      : procedure[type]
  }
}
