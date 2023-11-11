import { ApiError, ErrorCode } from '@neemata/common'
import { Container } from './container'
import { Loader } from './loader'
import { Logger } from './logger'
import {
  ApplicationOptions,
  BaseProcedure,
  Dependencies,
  Depender,
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

export class Api<
  Options extends Extra = {},
  Context extends Extra = {},
  T extends ProcedureDeclaration<
    Dependencies,
    Options,
    Context,
    any,
    any
  > = ProcedureDeclaration<Dependencies, Options, Context, any, any>
> extends Loader<T> {
  constructor(
    private readonly options: ApplicationOptions['api'],
    private readonly logger: Logger,
    private readonly middlewares: Middlewares,
    private readonly filters: Filters
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
    container: Container<Depender<{}>>,
    callContext: Extra,
    withMiddleware = declaration[MIDDLEWARE_ENABLED]
  ) {
    let middlewars = this.findMiddlewares(name)
    const { dependencies, procedure } = declaration
    const call = (declaration, payload) =>
      this.call(name, declaration, payload, container, callContext, false)
    const context = await container.context(dependencies, { call }, callContext)
    const handle = (payload) => {
      const middleware: Middleware | undefined = middlewars.next().value
      if (middleware) {
        const options = { name, context, procedure, container }
        const next = (newPayload = payload) => handle(newPayload)
        return middleware(options, payload, next)
      } else {
        return procedure.handle(context, payload)
      }
    }

    try {
      return await (withMiddleware
        ? handle(payload)
        : procedure.handle(context, payload))
    } catch (error) {
      throw this.handleFilters(error)
    }
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
          if (!handledError || !(handledError instanceof ApiError)) {
            this.logger.warn(
              `Error handler for ${error.constructor.name} did not return an ApiError instance, therefore is ignored.`
            )
            break
          }
          return handledError
        }
      }
    }
    return error
  }

  declareProcedure<Deps extends Dependencies, Data, Response>(
    procedure: BaseProcedure<Deps, Options, Context, Data, Response>,
    dependencies?: Deps,
    enableMiddleware = true
  ): ProcedureDeclaration<Deps, Options, Context, Data, Response> {
    const declaration = { procedure, dependencies }
    declaration[MIDDLEWARE_ENABLED] = enableMiddleware
    return declaration
  }

  registerProcedure(name: string, declaration: T, enableHooks = true) {
    // prevent override of original declaration, e.g if it was made by declareProcedure method
    declaration = merge(declaration, { [MIDDLEWARE_ENABLED]: enableHooks })
    this.modules.set(name, declaration)
  }
}
