import {
  AsProcedureOptions,
  BaseExtension,
  ExtensionInstallOptions,
  ExtensionMiddlewareOptions,
  Hook,
} from '@neemata/application'
import { match } from './utils'

export type SchemaExtensionOptions<Schema> = {
  procedureName?: string
  include?: Array<RegExp | string>
  exclude?: Array<RegExp | string>
  metadata?: (procedure: any) => Record<string, any>
  parse?: (schema: Schema | undefined, input: unknown) => any
  toJsonSchema?: (schema: Schema | undefined) => any
}

export type SchemaExtensionProcedureOptions<SchemaType> = {
  input?: SchemaType
  output?: SchemaType
}
export class SchemaExtension<SchemaType> extends BaseExtension<
  SchemaExtensionProcedureOptions<SchemaType>
> {
  name = 'SchemasExtension'

  constructor(private readonly options: SchemaExtensionOptions<SchemaType>) {
    super()
  }

  install({
    api,
    container,
    registerHook,
  }: ExtensionInstallOptions<
    SchemaExtensionProcedureOptions<SchemaType>,
    {}
  >): void {
    if (this.options.procedureName) this.registerProcedure(api, container)
    registerHook(Hook.Middleware, this.middleware.bind(this))
  }

  async registerProcedure(api: any, container: any) {
    const declaration = api.declareProcedure({
      handle: async () => {
        const jsonSchemas = {}
        for (const [name, { procedure, dependencies }] of api.modules) {
          if (declaration.procedure === procedure) continue

          if (this.options.include) {
            const matched = this.options.include.some((pattern) =>
              match(name, pattern)
            )
            if (!matched) continue
          }

          if (this.options.exclude) {
            const matched = this.options.exclude.some((pattern) =>
              match(name, pattern)
            )
            if (matched) continue
          }

          const context = await container.context(dependencies)
          const getJsonSchema = async (type: 'input' | 'output') => {
            const schema = await this.resolveOption(
              type,
              {
                name,
                context,
                procedure,
                container,
              },
              undefined
            )
            return await this.options.toJsonSchema(schema)
          }
          const [input, output] = await Promise.all([
            getJsonSchema('input'),
            getJsonSchema('output'),
          ])
          const metadata = this.options.metadata?.(procedure) ?? {}
          jsonSchemas[name] = { input, output, metadata }
        }
        return jsonSchemas
      },
    })
    api.registerProcedure(this.options.procedureName, declaration, false)
  }

  async middleware(
    arg: ExtensionMiddlewareOptions<
      AsProcedureOptions<SchemaExtensionProcedureOptions<SchemaType>>
    >,
    payload: any,
    next: (payload?: any) => any
  ) {
    const input = await this.resolveOption('input', arg, payload)
    const output = await this.resolveOption('output', arg, payload)
    const { parse } = this.options
    if (input) payload = await parse(input, payload)
    let result = await next(payload)
    if (output) result = await parse(output, result)
    return result
  }
}
