import {
  BaseClient,
  ExtensionInstallOptions,
  ExtensionInterface,
  Extra,
} from './types'

export abstract class BaseTransport<
  ProcedureOptions extends Extra = {},
  Context extends Extra = {},
  Client extends BaseClient = BaseClient
> implements ExtensionInterface<ProcedureOptions, Context>
{
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
