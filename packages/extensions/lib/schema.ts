import { BaseExtension, Procedure, match } from '@neemata/application'
import { JSONSchema, compile } from 'json-schema-to-typescript'
import fsp from 'node:fs/promises'

export type SchemaExtensionOptions<> = {
  procedureName?: string
  variants?: {
    typescript?: {
      interfaceName?: string
    }
  }
  include?: Array<RegExp | string>
  exclude?: Array<RegExp | string>
  metadata?: (procedure: any) => Record<string, any>
}

export class SchemaExtension extends BaseExtension {
  name = 'SchemasExtension'

  constructor(readonly options: SchemaExtensionOptions = {}) {
    super()
  }

  initialize(): void {
    const { api, registerCommand } = this.application
    if (this.options.procedureName) {
      api.registerProcedure(
        this.options.procedureName,
        new Procedure()
          .withHandler(this.jsonSchema.bind(this))
          .withMiddlewareEnabled(false)
      )
    }

    registerCommand('typescript', async ({ args: output }) => {
      await this.export({ typescript: output })
    })
  }

  private async jsonSchema() {
    const { api, container } = this.application
    const jsonSchemas = {}

    for (const [name, procedure] of api.modules) {
      if (name === this.options.procedureName) continue

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

      const getJsonSchema = async (type: 'input' | 'output') => {
        const context = this.application.container.createContext(
          procedure.dependencies
        )
        const schema = await this.application.api.resolveProcedureOption(
          procedure,
          type,
          context
        )
        return this.application.api.parsers[type]?.toJsonSchema(schema) ?? {}
      }

      const [input, output] = await Promise.all([
        getJsonSchema('input'),
        getJsonSchema('output'),
      ])
      const metadata = this.options.metadata?.(procedure) ?? {}
      jsonSchemas[name] = { input, output, metadata }
    }
    return jsonSchemas
  }

  private async export(targets) {
    const variants = {}
    const schemas = await this.jsonSchema()

    for (const variant of Object.keys(targets)) {
      variants[variant] = await this[variant](schemas)
    }

    for (const [variant, outputs] of Object.entries<string[]>(targets)) {
      for (const output of outputs) {
        await fsp.writeFile(output, variants[variant])
      }
    }
  }

  private async typescript(schemas: any) {
    const { interfaceName = 'Api' } = this.options.variants?.typescript ?? {}

    const metadataSchema = (metadata: JSONSchema): JSONSchema => {
      const keys = Object.keys(metadata)
      const properties = {}
      for (const key of keys) {
        const type = typeof metadata
        const oneOf = [metadata[key]]
        properties[key] = { type, oneOf }
      }
      return {
        type: 'object',
        properties,
        required: keys,
        additionalProperties: false,
      }
    }

    const procedureSchema = (input, output, metadata): JSONSchema => {
      const required = new Set(['metadata', 'output', 'input'])

      // "zod-to-json-schema" .optinal() workaround
      const isZodToJsonSchemaOptional = (schema) => {
        return typeof schema.not === 'object' && !Object.keys(schema.not).length
      }
      if (input.anyOf) {
        if (input.anyOf.some(isZodToJsonSchemaOptional))
          required.delete('input')
        const index = input.anyOf.findIndex(isZodToJsonSchemaOptional)
        if (index !== -1) input.anyOf.splice(index, 1)
      }
      if (output.anyOf) {
        if (output.anyOf.some(isZodToJsonSchemaOptional))
          required.delete('output')
        const index = output.anyOf.findIndex(isZodToJsonSchemaOptional)
        if (index !== -1) output.anyOf.splice(index, 1)
      }

      return {
        properties: {
          input,
          output,
          metadata: metadataSchema(metadata),
        },
        required: Array.from(required),
        additionalProperties: false,
      }
    }

    const proceduresSchema: JSONSchema = {
      type: 'object',
      properties: {},
      additionalProperties: false,
      required: [],
    }

    for (const entry of Object.entries<any>(schemas)) {
      const [procedure, { input, output, metadata }] = entry
      proceduresSchema.properties![procedure] = procedureSchema(
        input,
        output,
        metadata
      )
      proceduresSchema.required = [
        ...(proceduresSchema.required as string[]),
        procedure,
      ]
    }

    return await compile(proceduresSchema, interfaceName, { unknownAny: false })
  }
}
