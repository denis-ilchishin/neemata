import { ExtensionInstallOptions, ExtensionInterface, Extra } from './types'

export abstract class BaseExtension<
  ProcedureOptions extends Extra = {},
  Context extends Extra = {}
> implements ExtensionInterface<ProcedureOptions, Context>
{
  readonly application!: ExtensionInstallOptions<ProcedureOptions, Context>
  readonly _!: {
    context: Context
    options: ProcedureOptions
  }

  abstract name: string

  initialize?(): any
  context?(): Context
}
