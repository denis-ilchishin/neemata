import { ApiError, Transport } from '@neemata/common'
import { Config } from './config'
import { Container } from './container'
import { Loader } from './loader'

export class Api extends Loader<AnyProdecureDefinition> {
  readonly errorHandlers = new Map<ErrorHandler[0], ErrorHandler[1]>()

  constructor(private readonly config: Config) {
    super(config.logger, config.procedures)
    this.errorHandlers = new Map(config.errorHandlers ?? [])
  }

  handleError(error: Error) {
    if (this.errorHandlers.size) {
      for (const [errorType, errorHandler] of this.errorHandlers) {
        if (error instanceof errorType) {
          const handledError = errorHandler(error)
          if (!handledError || handledError.constructor !== ApiError) {
            console.warn(
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
  protected async import(name: string, path: string) {
    const module = await super.import(name, path)
    module.procedure.httpMethod ??= ['post']
    return module
  }

  async resolveProcedure(
    container: Container,
    procedureName: string,
    transport: Transport
  ) {
    const procedureDefinition = this.modules.get(procedureName)
    if (!procedureDefinition) return null
    const { dependencies, procedure } = procedureDefinition
    if (procedure.transport && procedure.transport !== transport) return null
    const { httpMethod } = procedure
    const ctx = await container.createDependencyContext(dependencies)
    const bind = (v?: Function) => v?.bind(null, ctx)
    const guards = bind(procedure.guards)
    const input = bind(procedure.input)
    const handle = bind(procedure.handle)
    const output = bind(procedure.output)
    return { guards, input, handle, output, httpMethod }
  }
}
