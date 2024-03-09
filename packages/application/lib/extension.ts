import { ExtensionApplication, Extra } from './types'

export abstract class BaseExtension<E extends Extra = {}> {
  readonly _!: {} & E
  readonly application!: ExtensionApplication

  abstract name: string

  initialize?(): void

  assign(application: this['application']) {
    // @ts-expect-error
    this.application = application
    this.initialize?.()
  }
}
