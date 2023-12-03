import { ExtensionInstallOptions, ExtensionInterface, Extra } from './types'

export abstract class BaseAdapter<
  ProcedureOptions extends Extra = {},
  Context extends Extra = {}
> implements ExtensionInterface<ProcedureOptions, Context>
{
  readonly _options!: ProcedureOptions

  context?(): Context

  abstract name: string
  abstract start(): any
  abstract stop(): any
  abstract install(
    application: ExtensionInstallOptions<ProcedureOptions, Context>
  ): any
}
