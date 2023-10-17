import { Scope } from '@neemata/common'
import { Config } from './config'
import { Loader } from './loader'
import { CONTEXT_SYMBOL, PROVIDER_SYMBOL } from './utils/definitions'

export class Container {
  private readonly providers = new Map<AnyProviderDefinition, any>()
  private readonly contexts = new Map<AnyContextDefinition, any>()
  private readonly resolving = new Map<any, Promise<any>>()

  constructor(
    private readonly config: Config,
    private readonly loader: Loader<AnyTaskDefinition | AnyProdecureDefinition>,
    private readonly mixin: () => any = () => ({}),
    private readonly scope: Scope = Scope.Global,
    private readonly params: any = {},
    private readonly parentProviders = new Map<AnyProviderDefinition, any>(),
    private readonly parentContexts = new Map<AnyContextDefinition, any>()
  ) {
    this.providers = new Map(parentProviders)
  }

  async load() {
    if (this.scope === Scope.Global) {
      const providerDefinitions = this.findGlobalProviderDependencies()
      await Promise.all(
        providerDefinitions.map(this.resolveProvider.bind(this))
      )
    }

    const contextDefinitions = Array.from(this.loader.contexts)
    await Promise.all(
      contextDefinitions
        .filter((c) => c.context.scope === this.scope)
        .map(this.resolveContext.bind(this))
    )
  }

  copy(scope: Scope, params: any = {}) {
    return new Container(
      this.config,
      this.loader,
      this.mixin,
      scope,
      params,
      new Map([...this.parentProviders, ...this.providers]),
      new Map([...this.parentContexts, ...this.contexts])
    )
  }

  async copyAndLoad(scope: Scope, params: any = {}) {
    const container = this.copy(scope, params)
    await container.load()
    return container
  }

  async dispose() {
    this.config.logger.debug('Disposing [%s] scope context...', this.scope)
    for (const [contextDefinition, value] of this.contexts) {
      try {
        const dispose = contextDefinition.context.dispose
        if (contextDefinition.context.scope === this.scope && dispose) {
          const ctx = await this.resolveContext(contextDefinition)
          await dispose(ctx, value, this.params)
        }
      } catch (cause) {
        this.config.logger.error(
          new Error('Context disposal error. Potential memory leak', { cause })
        )
      }
    }
    this.contexts.clear()
    this.providers.clear()
  }

  private findGlobalProviderDependencies() {
    const providers: AnyProviderDefinition[] = []

    const isGlobal = (dependecies?: Dependencies) => {
      return (
        !dependecies ||
        !Object.keys(dependecies).length ||
        Object.values(dependecies).every(
          (dependency) =>
            (dependency.injectableType !== CONTEXT_SYMBOL ||
              (dependency.injectableType === CONTEXT_SYMBOL &&
                (dependency as AnyContextDefinition).context.scope ===
                  Scope.Global)) &&
            isGlobal(dependency.dependencies)
        )
      )
    }

    for (const provider of this.loader.providers) {
      if (isGlobal(provider.dependencies)) providers.push(provider)
    }

    return providers
  }

  private async resolveProvider(providerDef: AnyProviderDefinition) {
    if (this.providers.has(providerDef)) return this.providers.get(providerDef)
    else if (this.resolving.has(providerDef)) {
      return this.resolving.get(providerDef)
    } else {
      const resolution = new Promise((resolve, reject) => {
        this.createDependencyContext(providerDef.dependencies)
          .then((ctx) => providerDef.provider(ctx))
          .then((instance) => {
            this.providers.set(providerDef, instance)
            resolve(instance)
          })
          .catch(reject)
      }).finally(() => this.resolving.delete(providerDef))
      this.resolving.set(providerDef, resolution)
      return resolution
    }
  }

  private async resolveContext(contextDef: AnyContextDefinition) {
    if (contextDef.context.scope !== this.scope)
      return this.parentContexts.get(contextDef)
    const { factory } = contextDef.context
    if (this.contexts.has(contextDef)) return this.contexts.get(contextDef)
    else if (this.resolving.has(contextDef)) {
      return this.resolving.get(contextDef)
    } else {
      const resolution = new Promise((resolve, reject) => {
        this.createDependencyContext(contextDef.dependencies)
          .then((ctx) => factory(ctx, this.params))
          .then((instance) => {
            this.contexts.set(contextDef, instance)
            resolve(instance)
          })
          .catch(reject)
      }).finally(() => this.resolving.delete(contextDef))
      this.resolving.set(contextDef, resolution)
      return resolution
    }
  }

  private async resolveDependecies(dependencies: Dependencies) {
    const resolved: any = {}
    if (!dependencies) return resolved
    const resolutions: Promise<any>[] = []
    for (const [key, dependency] of Object.entries(dependencies)) {
      const resolution =
        dependency.injectableType === PROVIDER_SYMBOL
          ? this.resolveProvider(dependency as AnyProviderDefinition)
          : dependency.injectableType === CONTEXT_SYMBOL
          ? this.resolveContext(dependency as AnyContextDefinition)
          : Promise.reject(new Error('Invalid dependency type'))
      resolution.then((value) => (resolved[key] = value))
      resolutions.push(resolution)
    }
    await Promise.all(resolutions)
    return resolved
  }

  async createDependencyContext(dependencies: Dependencies) {
    const injections = await this.resolveDependecies(dependencies)
    return {
      injections,
      ...this.mixin(),
    }
  }
}
