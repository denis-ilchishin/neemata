import { type AnyProvider, type ExecuteFn, type Merge, Scope } from './common'
import type { EventManager } from './events'
import type { Logger } from './logger'
import type { Registry } from './registry'
import type { BaseTransport } from './transport'
import { merge } from './utils/functions'

const ScopeStrictness = {
  [Scope.Global]: 0,
  [Scope.Connection]: 1,
  [Scope.Call]: 2,
  [Scope.Transient]: 3,
}

export function getProviderScope(provider: AnyProvider) {
  let scope = provider.scope
  for (const dependency of Object.values(
    provider.dependencies as Dependencies,
  )) {
    const provider =
      dependency instanceof Provider ? dependency : dependency.provider
    const dependencyScope = getProviderScope(provider)
    if (ScopeStrictness[dependencyScope] > ScopeStrictness[scope]) {
      scope = dependencyScope
    }
  }
  return scope
}

export type Dependencies = Record<
  string,
  AnyProvider | { isOptional: true; provider: AnyProvider }
>

export type ResolveProviderType<T extends AnyProvider> = Awaited<T['value']>

export interface Depender<Deps extends Dependencies = {}> {
  dependencies: Deps
}

export type DependencyContext<Deps extends Dependencies> = {
  [K in keyof Deps as Deps[K] extends AnyProvider
    ? K
    : never]: Deps[K] extends AnyProvider ? ResolveProviderType<Deps[K]> : never
} & {
  [K in keyof Deps as Deps[K] extends {
    isOptional: true
    provider: AnyProvider
  }
    ? K
    : never]?: Deps[K] extends {
    isOptional: true
    provider: AnyProvider
  }
    ? ResolveProviderType<Deps[K]['provider']>
    : never
}

export type ProviderFactoryType<
  ProviderType,
  ProviderDeps extends Dependencies,
> = (injections: DependencyContext<ProviderDeps>) => ProviderType

export type ProviderDisposeType<
  ProviderType,
  ProviderDeps extends Dependencies,
> = (
  instance: Awaited<ProviderType>,
  ctx: DependencyContext<ProviderDeps>,
) => any

export class Provider<
  ProviderValue = any,
  ProviderDeps extends Dependencies = {},
> implements Depender<ProviderDeps>
{
  static override<T>(
    newProvider: T,
    original: any,
    overrides: { [K in keyof Provider]?: any } = {},
  ): T {
    // @ts-expect-error
    Object.assign(newProvider, original, overrides)
    return newProvider
  }

  static key<T>() {
    return new Provider<T>()
  }

  readonly value!: ProviderValue
  readonly dependencies: ProviderDeps = {} as ProviderDeps
  readonly scope: Scope = Scope.Global
  readonly factory!: ProviderFactoryType<ProviderValue, ProviderDeps>
  readonly dispose?: ProviderDisposeType<ProviderValue, ProviderDeps>
  readonly description!: string

  withDependencies<Deps extends Dependencies>(dependencies: Deps) {
    const provider = new Provider<ProviderValue, Merge<ProviderDeps, Deps>>()
    return Provider.override(provider, this, {
      dependencies: merge(this.dependencies, dependencies),
    })
  }

  withScope<S extends Scope>(scope: S) {
    const provider = new Provider<ProviderValue, ProviderDeps>()
    return Provider.override(provider, this, { scope })
  }

  withFactory<
    F extends ProviderFactoryType<ProviderValue, ProviderDeps>,
    T extends Awaited<ReturnType<F>>,
  >(factory: F) {
    const provider = new Provider<T, ProviderDeps>()
    return Provider.override(provider, this, { factory, value: undefined })
  }

  withValue<T extends null extends ProviderValue ? any : ProviderValue>(
    value: T,
  ) {
    const provider = new Provider<
      null extends ProviderValue ? T : ProviderValue,
      ProviderDeps
    >()
    return Provider.override(provider, this, {
      value,
      factory: undefined,
      dispose: undefined,
    })
  }

  withDisposal(dispose: this['dispose']) {
    const provider = new Provider<ProviderValue, ProviderDeps>()
    return Provider.override(provider, this, { dispose })
  }

  withDescription(description: string) {
    const provider = new Provider<ProviderValue, ProviderDeps>()
    return Provider.override(provider, this, { description })
  }

  optional() {
    return {
      isOptional: true as const,
      provider: this as Provider<ProviderValue, ProviderDeps>,
    }
  }

  resolve(
    ...args: keyof ProviderDeps extends never
      ? []
      : [DependencyContext<ProviderDeps>]
  ) {
    if (this.value) return this.value
    const [ctx = {}] = args
    return this.factory(ctx as any)
  }
}

export class Container {
  readonly instances = new Map<AnyProvider, any>()
  private readonly resolvers = new Map<AnyProvider, Promise<any>>()
  private readonly providers = new Set<AnyProvider>()

  constructor(
    private readonly application: {
      registry: Registry
      logger: Logger
    },
    public readonly scope: Scope = Scope.Global,
    private readonly parent?: Container,
  ) {}

  async load() {
    for (const module of this.application.registry.modules) {
      await module.initializer?.({
        container: this,
        logger: this.application.logger,
        hooks: this.application.registry.hooks,
      })
    }

    const traverse = (dependencies: Dependencies) => {
      for (const key in dependencies) {
        const depender = dependencies[key]
        const provider =
          depender instanceof Provider ? depender : depender.provider
        this.providers.add(provider)
        traverse(provider.dependencies)
      }
    }

    for (const depender of this.getGlobals()) {
      traverse(depender.dependencies)
    }

    const providers = this.findCurrentScopeDeclarations()
    await Promise.all(providers.map((provider) => this.resolve(provider)))
  }

  createScope(scope: Scope) {
    return new Container(this.application, scope, this)
  }

  async dispose() {
    // TODO: here might need to find correct order of disposing
    // to prevent first disposal of a provider
    // that other disposing provider depends on
    this.application.logger.trace('Disposing [%s] scope context...', this.scope)
    for (const [{ dispose, dependencies }, value] of this.instances) {
      if (dispose) {
        try {
          const ctx = await this.createContext(dependencies)
          await dispose(value, ctx)
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

  isResolved(provider: AnyProvider): boolean {
    return !!(
      this.instances.has(provider) ||
      this.resolvers.has(provider) ||
      this.parent?.isResolved(provider)
    )
  }

  resolve<T extends AnyProvider>(provider: T): Promise<ResolveProviderType<T>> {
    if (this.instances.has(provider)) {
      return Promise.resolve(this.instances.get(provider)!)
    } else if (this.resolvers.has(provider)) {
      return this.resolvers.get(provider)!
    } else {
      const { value, factory, scope, dependencies } = provider
      if (typeof value !== 'undefined') return Promise.resolve(value)
      if (this.parent?.isResolved(provider))
        return this.parent.resolve(provider)
      const resolution = this.createContext(dependencies)
        .then((ctx) => factory(ctx))
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

  async createContext<T extends Dependencies>(dependencies: T) {
    const injections = await this.resolveDependecies(dependencies)
    return Object.freeze(injections)
  }

  async provide<T extends AnyProvider>(
    provider: T,
    value: ResolveProviderType<T>,
  ) {
    this.instances.set(provider, value)
  }

  private async resolveDependecies<T extends Dependencies>(dependencies: T) {
    const injections: any = {}
    const resolvers: Promise<any>[] = []
    for (const [key, dependency] of Object.entries(dependencies)) {
      const provider =
        dependency instanceof Provider ? dependency : dependency.provider
      const resolver = this.resolve(provider)
      resolvers.push(resolver.then((value) => (injections[key] = value)))
    }
    await Promise.all(resolvers)
    return injections as DependencyContext<T>
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

  private getGlobals() {
    return [
      ...this.application.registry.filters.values(),
      ...Array.from(this.application.registry.tasks.values()),
      ...Array.from(this.application.registry.procedures.values()),
    ]
  }
}

export const CONNECTION_PROVIDER = new Provider<
  BaseTransport['_']['connection']
>()
  .withScope(Scope.Connection)
  .withDescription('RPC connection')

export const EXECUTE_PROVIDER = new Provider<ExecuteFn>().withDescription(
  'Task execution function',
)

export const EVENT_MANAGER_PROVIDER =
  new Provider<EventManager>().withDescription('Event manager')

export const TASK_SIGNAL_PROVIDER = new Provider<AbortSignal>().withDescription(
  'Task abort signal',
)

export const LOGGER_PROVIDER = new Provider<Logger>().withDescription('Logger')
