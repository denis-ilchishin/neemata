import { ExtensionInstallOptions, ExtensionInterface, Extra } from './types'

export abstract class BaseAdapter<
  ProcedureOptions extends Extra = {},
  Context extends Extra = {}
> implements ExtensionInterface<ProcedureOptions, Context>
{
  readonly _options!: ProcedureOptions

  context?(): Context

  abstract name: string
  abstract install(
    options: ExtensionInstallOptions<ProcedureOptions, Context>
  ): any
  abstract start(): any
  abstract stop(): any
}
