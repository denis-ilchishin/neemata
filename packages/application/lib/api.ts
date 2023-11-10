import { ApiError, ErrorCode } from '@neemata/common'
import { Container } from './container'
import { Loader } from './loader'
import { Logger } from './logger'
import {
  ApplicationOptions,
  BaseProcedure,
  Dependencies,
  Depender,
  ErrorClass,
  Extra,
  ProcedureDeclaration,
} from './types'
import { merge } from './utils'

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
    private readonly middlewares: Set<Function>,
    private readonly errorHandlers: Map<ErrorClass, (error: Error) => Error>
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
    let middlewareIter = this.middlewares.values()
    const { dependencies, procedure } = declaration
    const call = (declaration, payload) =>
      this.call(name, declaration, payload, container, callContext, false)
    const context = await container.context(dependencies, { call }, callContext)
    const handle = (payload) => {
      const middleware = middlewareIter.next()?.value
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
      throw this.handleError(error)
    }
  }

  private handleError(error: any) {
    if (this.errorHandlers.size) {
      for (const [errorType, handler] of this.errorHandlers.entries()) {
        if (error instanceof errorType) {
          const handledError = handler(error)
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
