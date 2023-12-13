import { Scope } from '@neemata/common'
import { getProviderScope } from './container'
import {
  BaseClient,
  ExtensionInstallOptions,
  ExtensionInterface,
  Extra,
  ProviderDeclaration,
} from './types'

export abstract class BaseTransport<
  ProcedureOptions extends Extra = {},
  Context extends Extra = {},
  Client extends BaseClient = BaseClient
> implements ExtensionInterface<ProcedureOptions, Context>
{
  constructor(clientProvider: ProviderDeclaration<any> | undefined) {
    if (getProviderScope(clientProvider) !== Scope.Global) {
      throw new Error(
        'Client provider must be Global scope (including all dependencies)'
      )
    }
  }

  readonly _!: {
    options: ProcedureOptions
    context: Context
    client: Client
  }

  context?(): Context

  abstract name: string
  abstract start(): any
  abstract stop(): any
  abstract install(
    application: ExtensionInstallOptions<ProcedureOptions, Context>
  ): any
}
