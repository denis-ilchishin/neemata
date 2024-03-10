import fsp from 'node:fs/promises'
import { BaseExtension, Procedure, match } from '@neematajs/application'
import { type JSONSchema, compile } from 'json-schema-to-typescript'

export type SchemaExtensionOptions = {
  procedureName?: string
  variants?: {
    typescript?: {
      interfaceName?: string
    }
  }
  include?: Array<RegExp | string>
  exclude?: Array<RegExp | string>
}

export class SchemaExtension extends BaseExtension {
  name = 'SchemasExtension'

  constructor(readonly options: SchemaExtensionOptions = {}) {
    super()
  }

  initialize(): void {
    const { registry } = this.application
    if (this.options.procedureName) {
      registry.registerProcedure(
        this.options.procedureName,
        new Procedure()
          .withHandler(this.jsonSchema.bind(this))
          .withMiddlewareEnabled(false),
      )
    }

    registry.registerCommand('typescript', async ({ args: output }) => {
      await this.export({ typescript: output })
    })
  }

  private async jsonSchema() {
    const { registry } = this.application
    const jsonSchemas = {}

    for (const [name, { module: procedure }] of Object.entries(
      registry.procedures,
    )) {
      if (name === this.options.procedureName) continue

      if (this.options.include) {
        const matched = this.options.include.some((pattern) =>
          match(name, pattern),
        )
        if (!matched) continue
      }

      if (this.options.exclude) {
        const matched = this.options.exclude.some((pattern) =>
          match(name, pattern),
        )
        if (matched) continue
      }

      const getJsonSchema = (type: 'input' | 'output') => {
        const schema = procedure[type]
        const { [type]: globalParser } = this.application.api.parsers
        const { [type]: parser = globalParser } = procedure.parsers
        return parser?.toJsonSchema(schema) ?? {}
      }

      const input = getJsonSchema('input')
      const output = getJsonSchema('output')

      jsonSchemas[name] = { input, output, description: procedure.description }
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

    const procedureSchema = (input, output, description): JSONSchema => {
      const required = new Set(['output', 'input'])

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
        },
        description,
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
      const [procedure, { input, output, description }] = entry
      proceduresSchema.properties![procedure] = procedureSchema(
        input,
        output,
        description,
      )
      proceduresSchema.required = [
        ...(proceduresSchema.required as string[]),
        procedure,
      ]
    }

    return await compile(proceduresSchema, interfaceName, { unknownAny: false })
  }
}
