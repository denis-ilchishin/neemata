import {
  AnyApplication,
  AnyProvider,
  Extra,
  GlobalContext,
  Merge,
  Scope,
} from './types'
import { merge } from './utils/functions'

const ScopeStrictness = {
  [Scope.Global]: 0,
  [Scope.Connection]: 1,
  [Scope.Call]: 2,
  [Scope.Transient]: 3,
}

export function getProviderScope(provider: AnyProvider) {
  let scope = provider.scope
  for (const dependency of Object.values<AnyProvider>(provider.dependencies)) {
    const dependencyScope = getProviderScope(dependency)
    if (ScopeStrictness[dependencyScope] > ScopeStrictness[scope]) {
      scope = dependencyScope
    }
  }
  return scope
}

export type Dependencies = Record<string, AnyProvider>

export type ResolvedDependencyInjection<T extends Provider> = Awaited<
  T['value']
>

export interface Depender<Deps extends Dependencies = {}> {
  dependencies: Deps
}

export type DependencyContext<
  Context extends Extra,
  Deps extends Dependencies,
> = {
  context: GlobalContext & Context
} & {
  [K in keyof Deps]: ResolvedDependencyInjection<Deps[K]>
}

export type ProviderFactoryType<
  App extends AnyApplication,
  ProviderOptions extends any,
  ProviderDeps extends Dependencies,
  ProviderScope extends Scope,
  ProviderType = any,
> = (
  injections: DependencyContext<
    App['_']['context'] &
      (ProviderScope extends Exclude<Scope, Scope.Global>
        ? {
            connection: ProviderScope extends Scope.Transient
              ? App['_']['connection'] | undefined
              : App['_']['connection']
          }
        : {}),
    ProviderDeps
  >,
  options: ProviderOptions,
) => ProviderType

export type ProviderDisposeType<
  ProviderType,
  App extends AnyApplication,
  ProviderOptions extends any,
  ProviderDeps extends Dependencies,
> = (
  instance: Awaited<ProviderType>,
  ctx: DependencyContext<App['_']['context'], ProviderDeps>,
  options: ProviderOptions,
) => any

export class Provider<
  ProviderValue = any,
  App extends AnyApplication = AnyApplication,
  ProviderOptions extends any = unknown,
  ProviderDeps extends Dependencies = {},
  ProviderScope extends Scope = Scope,
  ProviderFactory extends ProviderFactoryType<
    App,
    ProviderOptions,
    ProviderDeps,
    ProviderScope
  > = ProviderFactoryType<App, ProviderOptions, ProviderDeps, ProviderScope>,
  ProviderDispose extends ProviderDisposeType<
    ProviderValue,
    App,
    ProviderOptions,
    ProviderDeps
  > = ProviderDisposeType<ProviderValue, App, ProviderOptions, ProviderDeps>,
> implements Depender<ProviderDeps>
{
  static override<T extends Provider<any, any, any, any, any, any, any>>(
    newProvider: T,
    original: any,
    overrides: { [K in keyof Provider]?: any } = {},
  ): T {
    Object.assign(newProvider, original, overrides)
    return newProvider
  }

  readonly value!: ProviderValue
  readonly dependencies: ProviderDeps = {} as ProviderDeps
  readonly scope: ProviderScope = Scope.Global as ProviderScope
  readonly factory!: ProviderFactory
  readonly dispose!: ProviderDispose
  readonly options!: ProviderOptions
  readonly description!: string

  withDependencies<Deps extends Dependencies>(dependencies: Deps) {
    const provider = new Provider<
      ProviderValue,
      App,
      ProviderOptions,
      Merge<ProviderDeps, Deps>,
      ProviderScope,
      ProviderFactoryType<App, ProviderOptions, Deps, ProviderScope>
    >()
    return Provider.override(provider, this, {
      dependencies: merge(this.dependencies, dependencies),
    })
  }

  withScope<S extends Scope>(scope: S) {
    const provider = new Provider<
      ProviderValue,
      App,
      ProviderOptions,
      ProviderDeps,
      S,
      ProviderFactoryType<App, ProviderOptions, ProviderDeps, S>,
      ProviderDispose
    >()
    return Provider.override(provider, this, { scope })
  }

  withOptionsType<Options>() {
    const provider = new Provider<
      ProviderValue,
      App,
      Options,
      ProviderDeps,
      ProviderScope,
      ProviderFactoryType<App, Options, ProviderDeps, ProviderScope>,
      ProviderDisposeType<ProviderValue, App, Options, ProviderDeps>
    >()
    return Provider.override(provider, this)
  }

  withFactory<
    F extends ProviderFactoryType<
      App,
      ProviderOptions,
      ProviderDeps,
      ProviderScope,
      ProviderValue extends never ? any : ProviderValue
    >,
    T extends Awaited<ReturnType<F>>,
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
    return Provider.override(provider, this, { factory, value: undefined })
  }

  withValue<T extends ProviderValue extends never ? any : ProviderValue>(
    value: T,
  ) {
    const provider = new Provider<
      T,
      App,
      ProviderOptions,
      ProviderDeps,
      ProviderScope,
      never,
      never
    >()
    return Provider.override(provider, this, {
      value,
      factory: undefined,
      dispose: undefined,
    })
  }

  withDisposal(dispose: ProviderDispose) {
    const provider = new Provider<
      ProviderValue,
      App,
      ProviderOptions,
      ProviderDeps,
      ProviderScope,
      ProviderFactory,
      ProviderDispose
    >()
    return Provider.override(provider, this, { dispose })
  }

  withOptions(options: ProviderOptions) {
    const provider = new Provider<
      ProviderValue,
      App,
      ProviderOptions,
      ProviderDeps,
      Scope.Transient,
      ProviderFactory,
      ProviderDispose
    >()
    return Provider.override(provider, this, { options })
  }

  withDescription(description: string) {
    const provider = new Provider<
      ProviderValue,
      App,
      ProviderOptions,
      ProviderDeps,
      ProviderScope,
      ProviderFactory,
      ProviderDispose
    >()
    return Provider.override(provider, this, { description })
  }
}

export class Container {
  readonly instances = new Map<AnyProvider, any>()
  private readonly resolvers = new Map<AnyProvider, Promise<any>>()
  private readonly providers = new Set<AnyProvider>()

  constructor(
    private readonly application: AnyApplication,
    private readonly scope: Scope = Scope.Global,
    private readonly params: Extra = {},
    private readonly parent?: Container,
  ) {}

  async load() {
    const traverse = (dependencies: Dependencies) => {
      for (const key in dependencies) {
        const depender = dependencies[key]
        this.providers.add(depender)
        traverse(depender.dependencies)
      }
    }

    for (const depender of this.application.loader.dependers()) {
      traverse(depender.dependencies)
    }

    const providers = this.findCurrentScopeDeclarations()
    await Promise.all(providers.map((val) => this.resolve(val)))
  }

  createScope(scope: Scope, params: any = {}) {
    return new Container(this.application, scope, params, this)
  }

  async dispose() {
    // TODO: here might need to find correct order of disposing
    // to prevent first disposal of a provider
    // that other disposing provider depends on
    this.application.logger.trace('Disposing [%s] scope context...', this.scope)
    for (const [{ dispose, options, dependencies }, value] of this.instances) {
      if (dispose) {
        try {
          const ctx = await this.createContext(dependencies)
          await dispose(value, merge(ctx, this.params), options)
        } catch (cause) {
          this.application.logger.error(
            new Error('Context disposal error. Potential memory leak', {
              cause,
            }),
          )
        }
      }
    }
    this.instances.clear()
    this.providers.clear()
    this.resolvers.clear()
  }

  private findCurrentScopeDeclarations() {
    const declarations: AnyProvider[] = []
    for (const provider of this.providers) {
      if (getProviderScope(provider) === this.scope) {
        declarations.push(provider)
      }
    }
    return declarations
  }

  isResolved(provider: AnyProvider): boolean {
    return !!(
      this.instances.has(provider) ||
      this.resolvers.has(provider) ||
      (this.parent && this.parent.isResolved(provider))
    )
  }

  resolve<T extends AnyProvider>(
    provider: T,
    ...extra: Extra[]
  ): Promise<ResolvedDependencyInjection<T>> {
    if (this.instances.has(provider)) {
      return Promise.resolve(this.instances.get(provider))
    } else if (this.resolvers.has(provider)) {
      return this.resolvers.get(provider)!
    } else {
      const { value, factory, scope, dependencies, options } = provider
      if (typeof value !== 'undefined') return Promise.resolve(value)
      const isStricter = ScopeStrictness[this.scope] > ScopeStrictness[scope]
      if (this.parent && isStricter && this.parent.isResolved(provider))
        return this.parent.resolve(provider)
      const resolution = this.createContext(dependencies, ...extra)
        .then((ctx) => factory(merge(ctx, this.params), options))
        .then((instance) => {
          if (ScopeStrictness[this.scope] >= ScopeStrictness[scope])
            this.instances.set(provider, instance)
          if (scope !== Scope.Transient) this.resolvers.delete(provider)
          return instance
        })
      if (scope !== Scope.Transient) this.resolvers.set(provider, resolution)
      return resolution
    }
  }

  private async resolveDependecies(
    dependencies: Dependencies,
    ...extra: Extra[]
  ) {
    const injections: any = {}
    const resolvers: Promise<any>[] = []
    for (const [key, dependency] of Object.entries(dependencies)) {
      const resolver = this.resolve(dependency, ...extra)
      resolvers.push(resolver.then((value) => (injections[key] = value)))
    }
    await Promise.all(resolvers)
    return injections
  }

  async createContext(dependencies: Dependencies, ...extra: Extra[]) {
    const injections = await this.resolveDependecies(dependencies, ...extra)
    const context = { context: merge(this.application.context, ...extra) }
    return Object.freeze(merge(context, injections))
  }
}
