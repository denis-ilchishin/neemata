import {
  AsProcedureOptions,
  Async,
  BaseExtension,
  ExtensionInstallOptions,
  ExtensionMiddlewareOptions,
  Hook,
  ProviderDeclaration,
} from '@neemata/application'
import { ApiError, ErrorCode } from '@neemata/common'
import { Pattern, match } from './utils'

export type Guard = () => Async<boolean>

export type GuardsProviderResolver = () =>
  | Guard[]
  | ProviderDeclaration<Guard[]>

export type GuardsExtensionOptions = {
  guards?: [[Pattern, GuardsProviderResolver[]]]
}

export type GuardsExtensionProcedureOptions = {
  guards?: Guard[]
}

export class GuardsExtension extends BaseExtension<GuardsExtensionProcedureOptions> {
  name = 'GuardsExtension'
  guards: Map<Pattern, GuardsProviderResolver[]>

  constructor(options?: GuardsExtensionOptions) {
    super()
    this.guards = new Map(options?.guards ?? [])
  }

  install({
    registerHook,
  }: ExtensionInstallOptions<GuardsExtensionProcedureOptions, {}>): void {
    registerHook(Hook.Middleware, this.middleware.bind(this))
  }

  async middleware(
    arg: ExtensionMiddlewareOptions<
      AsProcedureOptions<GuardsExtensionProcedureOptions>
    >,
    payload: any,
    next: () => any
  ) {
    await this.handleGlobalGuards(arg)
    await this.handleProcedureGuards(arg, payload)
    return next()
  }

  private async handleGlobalGuards(
    arg: ExtensionMiddlewareOptions<
      AsProcedureOptions<GuardsExtensionProcedureOptions>
    >
  ) {
    for (const [pattern, guardResolvers] of this.guards) {
      if (match(arg.name, pattern)) {
        for (const resolver of guardResolvers) {
          const provider = resolver()
          const guards = Array.isArray(provider)
            ? provider
            : await arg.container.resolve(provider)
          await this.handleGuards(guards)
          break
        }
      }
    }
  }

  private async handleProcedureGuards(
    arg: ExtensionMiddlewareOptions<
      AsProcedureOptions<GuardsExtensionProcedureOptions>
    >,
    payload: any
  ) {
    const guards = await this.resolveOption('guards', arg, payload)
    await this.handleGuards(guards)
  }

  private async handleGuards(guards?: Guard[]) {
    if (guards) {
      for (const guard of guards) {
        const permitted = await guard()
        if (!permitted) throw new ApiError(ErrorCode.Forbidden, 'Forbidden')
      }
    }
  }

  registerGuard(pattern: RegExp | string, resolver: GuardsProviderResolver[]) {
    this.guards.set(pattern, resolver)
  }
}
