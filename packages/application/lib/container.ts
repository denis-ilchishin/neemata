import type { EventManager } from './events'
import type { Logger } from './logger'
import type { Registry } from './registry'
import type { BaseTransport } from './transport'
import {
  type AnyProvider,
  type CallFn,
  type ExecuteFn,
  type Merge,
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

export type ResolveProviderType<T extends Provider> = Awaited<T['value']>

export interface Depender<Deps extends Dependencies = {}> {
  dependencies: Deps
}

export type DependencyContext<Deps extends Dependencies> = {
  [K in keyof Deps]: ResolveProviderType<Deps[K]>
}

export type ProviderFactoryType<
  ProviderType,
  ProviderOptions,
  ProviderDeps extends Dependencies,
> = (
  injections: DependencyContext<ProviderDeps>,
  options: ProviderOptions,
) => ProviderType

export type ProviderDisposeType<
  ProviderType,
  ProviderOptions,
  ProviderDeps extends Dependencies,
> = (
  instance: Awaited<ProviderType>,
  ctx: DependencyContext<ProviderDeps>,
  options: ProviderOptions,
) => any

export class Provider<
  ProviderValue = any,
  ProviderOptions = unknown,
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

  readonly value!: ProviderValue
  readonly dependencies: ProviderDeps = {} as ProviderDeps
  readonly scope: Scope = Scope.Global
  readonly factory!: ProviderFactoryType<
    ProviderValue,
    ProviderOptions,
    ProviderDeps
  >
  readonly dispose?: ProviderDisposeType<
    ProviderValue,
    ProviderOptions,
    ProviderDeps
  >
  readonly options!: ProviderOptions
  readonly description!: string

  withDependencies<Deps extends Dependencies>(dependencies: Deps) {
    const provider = new Provider<
      ProviderValue,
      ProviderOptions,
      Merge<ProviderDeps, Deps>
    >()
    return Provider.override(provider, this, {
      dependencies: merge(this.dependencies, dependencies),
    })
  }

  withScope<S extends Scope>(scope: S) {
    const provider = new Provider<
      ProviderValue,
      ProviderOptions,
      ProviderDeps
    >()
    return Provider.override(provider, this, { scope })
  }

  withOptionsType<Options>() {
    const provider = new Provider<ProviderValue, Options, ProviderDeps>()
    return Provider.override(provider, this)
  }

  withFactory<
    F extends ProviderFactoryType<ProviderValue, ProviderOptions, ProviderDeps>,
    T extends Awaited<ReturnType<F>>,
  >(factory: F) {
    const provider = new Provider<T, ProviderOptions, ProviderDeps>()
    return Provider.override(provider, this, { factory, value: undefined })
  }

  withValue<T extends ProviderValue extends never ? any : ProviderValue>(
    value: T,
  ) {
    const provider = new Provider<T, ProviderOptions, ProviderDeps>()
    return Provider.override(provider, this, {
      value,
      factory: undefined,
      dispose: undefined,
    })
  }

  withDisposal(dispose: this['dispose']) {
    const provider = new Provider<
      ProviderValue,
      ProviderOptions,
      ProviderDeps
    >()
    return Provider.override(provider, this, { dispose })
  }

  withOptions(options: ProviderOptions) {
    const provider = new Provider<
      ProviderValue,
      ProviderOptions,
      ProviderDeps
    >()
    return Provider.override(provider, this, { options })
  }

  withDescription(description: string) {
    const provider = new Provider<
      ProviderValue,
      ProviderOptions,
      ProviderDeps
    >()
    return Provider.override(provider, this, { description })
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
    const traverse = (dependencies: Dependencies) => {
      for (const key in dependencies) {
        const depender = dependencies[key]
        this.providers.add(depender)
        traverse(depender.dependencies)
      }
    }

    for (const depender of this.application.registry.globals()) {
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
    for (const [{ dispose, options, dependencies }, value] of this.instances) {
      if (dispose) {
        try {
          const ctx = await this.createContext(dependencies)
          await dispose(value, ctx, options)
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
      const { value, factory, scope, dependencies, options } = provider
      if (typeof value !== 'undefined') return Promise.resolve(value)
      if (this.parent?.isResolved(provider))
        return this.parent.resolve(provider)
      // if (typeof factory !== 'function') console.log(provider)
      const resolution = this.createContext(dependencies)
        .then((ctx) => factory(ctx, options))
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
      const resolver = this.resolve(dependency)
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
}

export const CONNECTION_PROVIDER = new Provider<
  BaseTransport['_']['connection']
>()
  .withScope(Scope.Connection)
  .withDescription('RPC connection')

export const CALL_PROVIDER = new Provider<CallFn>()
  .withScope(Scope.Connection)
  .withDescription('RPC nested call function')

export const EXECUTE_PROVIDER = new Provider<ExecuteFn>().withDescription(
  'Task execution function',
)

export const EVENT_MANAGER_PROVIDER =
  new Provider<EventManager>().withDescription('Event manager')

export const TASK_SIGNAL_PROVIDER = new Provider<AbortSignal>().withDescription(
  'Task abort signal',
)

export const LOGGER_PROVIDER = new Provider<Logger>().withDescription('Logger')
