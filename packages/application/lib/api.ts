import { ApiError, ErrorCode } from '@neemata/common'
import { Application, ApplicationOptions } from './application'
import { Container } from './container'
import { Loader } from './loader'
import {
  BaseProcedure,
  Dependencies,
  ExtensionMiddlewareOptions,
  Extra,
  ExtractAppContext,
  ExtractAppOptions,
  Middleware,
  ProcedureDeclaration,
} from './types'
import { match, merge } from './utils/functions'

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
    private readonly application: Application<any, any, any, any>,
    private readonly options: ApplicationOptions['api'] = {},
    readonly parser: BaseParser | undefined = options.parser
  ) {
    super(options.path ?? '')
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
    const nestedCall = (declaration, payload) =>
      this.call(name, declaration, payload, container, callContext, false)
    const context = await container.createContext(dependencies, callContext, {
      call: nestedCall,
    })
    const options: ExtensionMiddlewareOptions<any, any> = {
      name,
      context,
      procedure,
      container,
    }
    const handleProcedure = async (payload) => {
      const middleware: Middleware | undefined = middlewars?.next().value
      if (middleware) {
        const next = (newPayload = payload) => handleProcedure(newPayload)
        return middleware(options, payload, next)
      } else {
        // TODO: maybe disable schema handling for nested calls or make it optional at least?
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

  registerProcedure(name: string, declaration: T, enableHooks = true) {
    // prevent override of original declaration, e.g if it was made by declareProcedure method
    declaration = merge(declaration, { [MIDDLEWARE_ENABLED]: enableHooks })
    this.modules.set(name, declaration)
  }

  getProcedureSchema(procedure, context, type: 'input' | 'output') {
    return typeof procedure[type] === 'function'
      ? procedure[type](context)
      : procedure[type]
  }

  protected set(name: string, path: string, module: any): void {
    this.application.logger.info('Resolve [%s] procedure', name, path)
    super.set(name, path, module)
  }

  private findMiddlewares(name: string) {
    const set: Middleware[] = []
    for (const [pattern, middlewares] of this.application.middlewares) {
      if (match(name, pattern)) set.push(...middlewares)
    }
    return set[Symbol.iterator]()
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
}

export const declareProcedure = (
  procedure: BaseProcedure<any, any, any, any, any, any>,
  dependencies?: Dependencies,
  enableMiddleware = true
) => {
  const declaration = { procedure, dependencies }
  declaration[MIDDLEWARE_ENABLED] = enableMiddleware
  return declaration
}

export const createTypedDeclareProcedure =
  <
    App,
    Options extends ExtractAppOptions<App> = ExtractAppOptions<App>,
    Context extends ExtractAppContext<App> = ExtractAppContext<App>
  >() =>
  <Deps extends Dependencies, Input, Response, Output>(
    procedure: BaseProcedure<Deps, Options, Context, Input, Response, Output>,
    dependencies?: Deps,
    enableMiddleware = true
  ): ProcedureDeclaration<Deps, Options, Context, Input, Response, Output> => {
    // @ts-expect-error
    return declareProcedure(procedure, dependencies, enableMiddleware)
  }
