import {
  ApiError,
  AsProcedureOptions,
  Async,
  BaseExtension,
  ErrorCode,
  ExtensionInstallOptions,
  ExtensionMiddlewareOptions,
  Pattern,
  ProviderDeclaration,
  match,
} from '@neemata/application'

export type Guard = () => Async<boolean>

export type GuardsProviderResolver = Guard[] | ProviderDeclaration<Guard[]>

export type GuardsExtensionOptions = {
  guards?: [[Pattern, GuardsProviderResolver]]
  concurrent?: boolean
}

export type GuardsExtensionProcedureOptions = {
  guards?: Guard[]
}

export class GuardsExtension extends BaseExtension<GuardsExtensionProcedureOptions> {
  name = 'GuardsExtension'
  guards: Map<Pattern, GuardsProviderResolver>
  application!: ExtensionInstallOptions<GuardsExtensionProcedureOptions, {}>
  concurrent: boolean

  constructor(options?: GuardsExtensionOptions) {
    super()
    this.guards = new Map(options?.guards ?? [])
    this.concurrent = options?.concurrent ?? false
  }

  install(
    application: ExtensionInstallOptions<GuardsExtensionProcedureOptions, {}>
  ): void {
    this.application = application
    this.application.registerMiddleware('*', this.middleware.bind(this))
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

  private async handleGlobalGuards({
    container,
    name,
  }: ExtensionMiddlewareOptions<
    AsProcedureOptions<GuardsExtensionProcedureOptions>
  >) {
    for (const [pattern, provider] of this.guards) {
      if (match(name, pattern)) {
        const guards = Array.isArray(provider)
          ? provider
          : await container.resolve(provider)
        if (guards) await this.handleGuards(guards)
      }
    }
  }

  private async handleProcedureGuards(
    arg: ExtensionMiddlewareOptions<
      AsProcedureOptions<GuardsExtensionProcedureOptions>
    >,
    payload: any
  ) {
    const guards = await this.resolveProcedureOption('guards', arg)
    if (guards) await this.handleGuards(guards)
  }

  private async handleGuards(guards: Guard[]) {
    const handle = async (guard: Guard) => {
      const permitted = await guard()
      if (!permitted) throw new ApiError(ErrorCode.Forbidden, 'Forbidden')
    }

    if (this.concurrent) {
      await Promise.all(guards.map(handle))
    } else {
      for (const guard of guards) await handle(guard)
    }
  }

  registerGuard(pattern: RegExp | string, resolver: GuardsProviderResolver) {
    this.guards.set(pattern, resolver)
  }
}
