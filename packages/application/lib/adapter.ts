import {
  Async,
  ExtensionInstallOptions,
  ExtensionInterface,
  Extra,
} from './types'

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
  ): Async<void>
  abstract start(): Async<void>
  abstract stop(): Async<void>
}
