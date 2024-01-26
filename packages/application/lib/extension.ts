import { ExtensionApplication, Extra } from './types'

export abstract class BaseExtension<
  ProcedureOptions extends Extra = {},
  Context extends Extra = {},
  E extends Extra = {},
> {
  readonly application!: ExtensionApplication<ProcedureOptions, Context>
  readonly _!: {
    context: Context
    options: ProcedureOptions
  } & E

  abstract name: string

  initialize?(): any
  context?(): Context

  assign(application: this['application']) {
    // @ts-expect-error
    this.application = application
    this.initialize?.()
  }
}
