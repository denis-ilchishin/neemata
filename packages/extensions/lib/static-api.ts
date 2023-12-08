import {
  Api,
  BaseExtension,
  ExtensionInstallOptions,
  Hook,
  ProcedureDataType,
  ProcedureDeclaration,
  WorkerType,
} from '@neemata/application'
import { writeFile } from 'node:fs/promises'
import { dirname, relative } from 'node:path'

export class StaticApiAnnotations extends BaseExtension {
  name = 'Static API annotations'

  constructor(private readonly options: { output: string }) {
    super()
  }

  install({
    type,
    api,
    registerHook,
    registerCommand,
  }: ExtensionInstallOptions<{}, {}>) {
    const command = () => this.generate(api)
    if (type === WorkerType.Api) registerHook(Hook.AfterInitialize, command)
    registerCommand('generate', command)
  }

  private generate = async (api: Api<any, any, any>) => {
    const procedures: any = []
    for (const [name, filePath] of api.paths) {
      const path = relative(dirname(this.options.output), filePath)
      procedures.push(`"${name}": typeof import("${path}").default`)
    }
    const entries = `\n  ${procedures.join(',\n  ')}\n`
    const dtsContent = `export declare type Api = import('@neemata/application').ResolveApi<{${entries}}>`
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
