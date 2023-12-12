import {
  AsProcedureOptions,
  Async,
  ExtensionInstallOptions,
  ExtensionInterface,
  ExtensionMiddlewareOptions,
  Extra,
} from './types'

export abstract class BaseExtension<
  ProcedureOptions extends Extra = {},
  Context extends Extra = {},
  MiddlewareOptions extends ExtensionMiddlewareOptions<
    AsProcedureOptions<ProcedureOptions>,
    Context
  > = ExtensionMiddlewareOptions<AsProcedureOptions<ProcedureOptions>, Context>
> implements ExtensionInterface<ProcedureOptions, Context>
{
  readonly _!: {
    context: Context
    options: ProcedureOptions
  }

  abstract name: string

  install?(options: ExtensionInstallOptions<ProcedureOptions, Context>): any
  context?(): Context

  protected resolveProcedureOption<T extends keyof ProcedureOptions>(
    optionName: T,
    options: MiddlewareOptions
  ): Async<ProcedureOptions[T]> {
    return typeof options.procedure[optionName] === 'function'
      ? options.procedure[optionName](options.context)
      : options.procedure[optionName]
  }
}
