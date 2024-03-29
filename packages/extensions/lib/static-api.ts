import { writeFile } from 'node:fs/promises'
import { dirname, relative } from 'node:path'
import { BaseExtension, Hook } from '@neematajs/application'

const packageName = '@neematajs/application'
export class StaticApiAnnotations extends BaseExtension {
  name = 'Static API annotations'

  constructor(
    private readonly options: {
      outputPath: string
      emit: boolean
    },
  ) {
    super()
  }

  initialize() {
    const { registry } = this.application
    registry.registerCommand('emit', () => this.emit())
    if (this.options.emit !== false) {
      registry.registerHook(Hook.AfterInitialize, this.emit.bind(this))
    }
  }

  private async emit() {
    const procedures: any = []
    for (const [name, { path: filePath, exportName }] of this.application
      .registry.procedures) {
      if (filePath && exportName) {
        const path = relative(dirname(this.options.outputPath), filePath)
        procedures.push(`"${name}": typeof import("${path}")${exportName}`)
      } else {
        procedures.push(`"${name}": import("${packageName}").Procedure`)
      }
    }

    const events: any = []
    for (const [name, { path: filePath, exportName }] of this.application
      .registry.events) {
      if (filePath && exportName) {
        const path = relative(dirname(this.options.outputPath), filePath)
        events.push(`"${name}": typeof import("${path}")${exportName}`)
      } else {
        events.push(`"${name}": import("${packageName}").Event`)
      }
    }

    const procedureEntries = `\n  ${procedures.join(',\n  ')}\n`
    const eventEntries = `\n  ${events.join(',\n  ')}\n`
    const dtsContent = `export declare type Procedures = import("${packageName}").ResolveProcedures<{${procedureEntries}}>;\nexport declare type Events = import("${packageName}").ResolveEvents<{${eventEntries}}>`
    await writeFile(this.options.outputPath, dtsContent)
  }
}
