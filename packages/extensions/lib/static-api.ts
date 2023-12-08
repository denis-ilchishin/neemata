import {
  BaseExtension,
  ExtensionInstallOptions,
  Hook,
  ProcedureDataType,
  ProcedureDeclaration,
  WorkerType,
} from '@neemata/application'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'

export class StaticApiAnnotations extends BaseExtension {
  name = 'Static API annotations'

  application!: ExtensionInstallOptions<{}, {}>

  constructor(private readonly options: { output: string }) {
    super()
  }

  install(application: ExtensionInstallOptions<{}, {}>) {
    this.application = application

    const { type, api, registerHook, registerCommand } = application

    registerCommand('generate', async () => {
      if (type !== WorkerType.Api) await api.load()
      await this.generate()
    })

    if (type === WorkerType.Api)
      registerHook(Hook.AfterInitialize, this.generate.bind(this))
  }

  private async generate() {
    const packageJson = await readFile(
      resolve(__dirname, '../package.json'),
      'utf-8'
    )
    const { name } = JSON.parse(packageJson)
    const procedures: any = []
    for (const [name, filePath] of this.application.api.paths) {
      const path = relative(dirname(this.options.output), filePath)
      procedures.push(`"${name}": typeof import("${path}").default`)
    }
    const entries = `\n  ${procedures.join(',\n  ')}\n`
    const dtsContent = `export declare type Api = import("${name}").ResolveApi<{${entries}}>`
    await writeFile(this.options.output, dtsContent)
  }
}

export type ResolveApi<Input extends Record<string, any>> = {
  [K in keyof Input as Input[K] extends ProcedureDeclaration<
    any,
    any,
    any,
    any,
    any,
    any
  >
    ? K
    : never]: Input[K] extends ProcedureDeclaration<
    any,
    any,
    any,
    infer Input,
    infer Response,
    infer Output
  >
    ? {
        input: ProcedureDataType<Input>
        output: Awaited<
          Output extends unknown ? Response : ProcedureDataType<Output>
        >
      }
    : never
}
