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
  readonly _options!: ProcedureOptions

  abstract name: string

  install?(options: ExtensionInstallOptions<ProcedureOptions, Context>): void
  context?(): Context

  protected resolveOption<T extends keyof ProcedureOptions>(
    optionName: T,
    options: MiddlewareOptions,
    data: any
  ): Async<ProcedureOptions[T]> {
    return typeof options.procedure[optionName] === 'function'
      ? options.procedure[optionName](options.context, data)
      : options.procedure[optionName]
  }
}
