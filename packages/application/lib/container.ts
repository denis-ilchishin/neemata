import {
  AnyApplication,
  Extra,
  GlobalContext,
  LoaderInterface,
  Scope,
} from './types'
import { merge } from './utils/functions'

const ScopeStrictness = {
  [Scope.Global]: 0,
  [Scope.Connection]: 1,
  [Scope.Call]: 2,
  [Scope.Transient]: 3,
}

export function getProviderScope(provider: Provider) {
  let scope = provider.scope
  for (const dependency of Object.values<Provider>(provider.dependencies)) {
    const dependencyScope = getProviderScope(dependency)
    if (ScopeStrictness[dependencyScope] > ScopeStrictness[scope]) {
      scope = dependencyScope
    }
  }
  return scope
}

export type Dependencies<DependencyScope extends Scope = Scope> = Record<
  string,
  Provider<
    any,
    AnyApplication,
    unknown,
    Dependencies<DependencyScope>,
    DependencyScope
  >
>

export type ResolvedDependencyInjection<T extends Provider> = Awaited<T['type']>

export interface Depender<Deps extends Dependencies> {
  dependencies: Deps
}

export type DependencyContext<
  Context extends Extra,
  Deps extends Dependencies
> = GlobalContext &
  Context & {
    injections: {
      [K in keyof Deps]: ResolvedDependencyInjection<Deps[K]>
    }
  }

export type ProviderFactoryType<
  App extends AnyApplication,
  ProviderOptions extends any,
  ProviderDeps extends Dependencies,
  ProviderScope extends Scope,
  ProviderType = any
> = (
  ctx: DependencyContext<App['_']['context'], ProviderDeps> &
    (ProviderScope extends Exclude<Scope, Scope.Global | Scope.Transient>
      ? {
          client: App['_']['client']
        }
      : ProviderScope extends Scope.Transient
      ? {
          client?: App['_']['client']
        }
      : {}),
  options: ProviderOptions
) => ProviderType

export type ProviderDisposeType<
  ProviderType,
  App extends AnyApplication,
  ProviderOptions extends any,
  ProviderDeps extends Dependencies
> = (
  instance: Awaited<ProviderType>,
  ctx: DependencyContext<App['_']['context'], ProviderDeps>,
  options: ProviderOptions
) => any

export class Provider<
  ProviderType = any,
  App extends AnyApplication = AnyApplication,
  ProviderOptions extends any = unknown,
  ProviderDeps extends Dependencies = Dependencies,
  ProviderScope extends Scope = Scope,
  ProviderFactory extends ProviderFactoryType<
    App,
    ProviderOptions,
    ProviderDeps,
    ProviderScope
  > = ProviderFactoryType<App, ProviderOptions, ProviderDeps, ProviderScope>,
  ProviderDispose extends ProviderDisposeType<
    ProviderType,
    App,
    ProviderOptions,
    ProviderDeps
  > = ProviderDisposeType<ProviderType, App, ProviderOptions, ProviderDeps>
> implements Depender<ProviderDeps>
{
  readonly type!: ProviderType
  readonly dependencies: ProviderDeps = {} as ProviderDeps
  readonly scope: ProviderScope = Scope.Global as ProviderScope
  readonly factory!: ProviderFactory
  readonly dispose!: ProviderDispose
  readonly options!: ProviderOptions

  withDependencies<Deps extends Dependencies>(dependencies: Deps) {
    const provider = new Provider<
      ProviderType,
      App,
      ProviderOptions,
      Deps,
      ProviderScope,
      ProviderFactoryType<App, ProviderOptions, Deps, ProviderScope>
    >()
    Object.assign(provider, this, { dependencies })
    return provider
  }

  withScope<S extends Scope>(scope: S) {
    const provider = new Provider<
      ProviderType,
      App,
      ProviderOptions,
      ProviderDeps,
      S,
      ProviderFactoryType<App, ProviderOptions, ProviderDeps, S>,
      ProviderDispose
    >()
    Object.assign(provider, this, { scope })
    return provider
  }

  withOptionsType<Options>() {
    const provider = new Provider<
      ProviderType,
      App,
      Options,
      ProviderDeps,
      ProviderScope,
      ProviderFactoryType<App, Options, ProviderDeps, ProviderScope>,
      ProviderDisposeType<ProviderType, App, Options, ProviderDeps>
    >()
    Object.assign(provider, this)
    return provider
  }

  withFactory<
    F extends ProviderFactoryType<
      App,
      ProviderOptions,
      ProviderDeps,
      ProviderScope,
      ProviderType extends never ? unknown : ProviderType
    >,
    T extends Awaited<ReturnType<F>>
  >(factory: F) {
    const provider = new Provider<
      T,
      App,
      ProviderOptions,
      ProviderDeps,
      ProviderScope,
      F,
      ProviderDisposeType<T, App, ProviderOptions, ProviderDeps>
    >()
    Object.assign(provider, this, { factory })
    return provider
  }

  withDisposal(dispose: ProviderDispose) {
    const provider = new Provider<
      ProviderType,
      App,
      ProviderOptions,
      ProviderDeps,
      ProviderScope,
      ProviderFactory,
      ProviderDispose
    >()
    Object.assign(provider, this, { dispose })
    return provider
  }

  withOptions(options: ProviderOptions) {
    const provider = new Provider<
      ProviderType,
      App,
      ProviderOptions,
      ProviderDeps,
      Scope.Transient,
      ProviderFactory,
      ProviderDispose
    >()
    Object.assign(provider, this, { options, scope: Scope.Transient })
    return provider
  }
}

export class Container {
  readonly instances = new Map<Provider, any>()
  private readonly resolvers = new Map<Provider, Promise<any>>()
  private readonly providers = new Set<Provider>()

  constructor(
    private readonly application: AnyApplication,
    private readonly loaders: LoaderInterface<Depender<Dependencies>>[],
    private readonly scope: Scope = Scope.Global,
    private readonly params: Extra = {},
    private readonly parent?: Container
  ) {}

  async load() {
    const traverse = (dependencies: Dependencies) => {
      for (const key in dependencies) {
        const depender = dependencies[key]
        this.providers.add(depender)
        if (!depender.dependencies) continue
        traverse(depender.dependencies)
      }
    }

    for (const loader of this.loaders) {
      for (const depender of loader.modules.values()) {
        traverse(depender.dependencies)
      }
    }

    const providers = this.findCurrentScopeDeclarations()
    await Promise.all(providers.map((val) => this.resolve(val)))
  }

  createScope(scope: Scope, params: any = {}) {
    return new Container(this.application, this.loaders, scope, params, this)
  }

  async dispose() {
    // TODO: here might need to find correct order of disposing
    // to prevent first disposal of a provider
    // that other disposing provider depends on
    this.application.logger.debug('Disposing [%s] scope context...', this.scope)
    for (const [{ dispose, options, dependencies }, value] of this.instances) {
      try {
        if (dispose) {
          const ctx = await this.createContext(dependencies)
          await dispose(value, merge(ctx, this.params), options)
        }
      } catch (cause) {
        this.application.logger.error(
          new Error('Context disposal error. Potential memory leak', { cause })
        )
      }
    }
    this.instances.clear()
    this.providers.clear()
    this.resolvers.clear()
  }

  private findCurrentScopeDeclarations() {
    const declarations: Provider[] = []
    for (const provider of this.providers) {
      if (getProviderScope(provider) === this.scope) {
        declarations.push(provider)
      }
    }
    return declarations
  }

  isResolved(value: any) {
    return (
      this.instances.has(value) ||
      this.resolvers.has(value) ||
      (this.parent && this.parent.isResolved(value))
    )
  }

  async resolve<T extends Provider>(
    value: T
  ): Promise<ResolvedDependencyInjection<T>> {
    const { factory, scope, dependencies, options } = value

    if (this.instances.has(value)) {
      return this.instances.get(value)
    } else if (this.resolvers.has(value)) {
      return this.resolvers.get(value)
    } else {
      const isStricter = ScopeStrictness[this.scope] > ScopeStrictness[scope]
      if (this.parent && isStricter && this.parent.isResolved(value))
        return this.parent.resolve(value)
      const resolution = this.createContext(dependencies)
        .then((ctx) => factory(merge(this.params, ctx), options))
        .then((instance) => {
          if (scope === this.scope) this.instances.set(value, instance)
          if (scope !== Scope.Transient) this.resolvers.delete(value)
          return instance
        })
      if (scope !== Scope.Transient) this.resolvers.set(value, resolution)
      return resolution as any
    }
  }

  private async resolveDependecies(dependencies: Dependencies) {
    const injections: any = {}
    if (!dependencies) return injections
    const resolvers: Promise<any>[] = []
    for (const [key, dependency] of Object.entries(dependencies)) {
      const resolver = this.resolve(dependency)
      resolver.then((value) => (injections[key] = value))
      resolvers.push(resolver)
    }
    await Promise.all(resolvers)
    return Object.freeze(injections)
  }

  async createContext(dependencies: Dependencies, ...extra: Extra[]) {
    const injections = await this.resolveDependecies(dependencies)
    const context = merge(this.application.context, ...extra, { injections })
    return Object.freeze(context)
  }
}
