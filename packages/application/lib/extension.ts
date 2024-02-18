import { ExtensionApplication, Extra } from './types'

export abstract class BaseExtension<
  Context extends Extra = {},
  E extends Extra = {},
> {
  readonly _!: {} & E
  readonly application!: ExtensionApplication

  abstract name: string

  initialize?(): void
  context?(): Context

  assign(application: this['application']) {
    // @ts-expect-error
    this.application = application
    this.initialize?.()
  }
}
