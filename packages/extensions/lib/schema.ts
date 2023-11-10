import {
  AsProcedureOptions,
  BaseExtension,
  ExtensionInstallOptions,
  ExtensionMiddlewareOptions,
  Hook,
} from '@neemata/application'
import { spawnSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path, { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { match } from './utils'

export type SchemaExtensionOptions<Schema> = {
  procedureName?: string
  include?: Array<RegExp | string>
  exclude?: Array<RegExp | string>
  metadata?: (procedure: any) => Record<string, any>
  parse?: (schema: Schema, input: unknown) => any
  toJsonSchema?: (schema?: Schema) => any
}

export type SchemaExtensionProcedureOptions<SchemaType> = {
  input?: SchemaType
  output?: SchemaType
}
export class SchemaExtension<SchemaType> extends BaseExtension<
  SchemaExtensionProcedureOptions<SchemaType>
> {
  name = 'SchemasExtension'
  application!: ExtensionInstallOptions<
    SchemaExtensionProcedureOptions<SchemaType>,
    {}
  >

  constructor(private readonly options: SchemaExtensionOptions<SchemaType>) {
    super()
  }

  install(
    application: ExtensionInstallOptions<
      SchemaExtensionProcedureOptions<SchemaType>,
      {}
    >
  ): void {
    this.application = application
    if (this.options.procedureName) this.registerProcedure()
    this.application.registerHook(Hook.Middleware, this.middleware.bind(this))

    // TODO: redesign code generation, it shouldn't require any temp files nor process spawning, and be configurable, e.g custom definitions, types, potentially even support of other languages
    this.application.registerCommand('dts', async ({ args }) => {
      const [output] = args
      await this.application.api.load()
      const schema = await this.jsonSchema()
      const tmpJson = join(
        await mkdtemp(path.join(os.tmpdir())),
        'neemata-json-schema'
      )
      try {
        await writeFile(tmpJson, JSON.stringify(schema))
        spawnSync('./node_modules/.bin/neemata-generate-dts', [
          '--input=' + pathToFileURL(tmpJson),
          '--output=' + output,
        ])
      } finally {
        await rm(tmpJson, { recursive: true, force: true }).catch(() => {})
      }
    })
  }

  async registerProcedure() {
    const { api } = this.application
    const declaration = api.declareProcedure({
      handle: async () => this.jsonSchema(),
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
    const [input, output] = await Promise.all([
      this.resolveOption('input', arg, payload),
      this.resolveOption('output', arg, payload),
    ])
    const { parse } = this.options
    if (input) payload = await parse(input, payload)
    let result = await next(payload)
    if (output) result = await parse(output, result)
    return result
  }

  private async jsonSchema() {
    const { api, container } = this.application
    const jsonSchemas = {}
    for (const [name, { procedure, dependencies }] of api.modules) {
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
  }
}
