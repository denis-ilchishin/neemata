import { Scope } from '@neemata/common'
import { Logger } from './logger'
import {
  Dependencies,
  Depender,
  Extra,
  ExtractAppContext,
  LoaderInterface,
  Provider,
  ProviderDeclaration,
  ProviderFactory,
  ResolvedDependencyInjection,
} from './types'
import { merge } from './utils/functions'

const ScopeStrictness = {
  [Scope.Global]: 0,
  [Scope.Connection]: 1,
  [Scope.Call]: 2,
}

export function getProviderScope(declaration: ProviderDeclaration) {
  let scope = declaration.provider.scope ?? Scope.Global
  for (const dependency of Object.values(declaration.dependencies ?? {})) {
    const dependencyScope = getProviderScope(dependency)
    if (ScopeStrictness[dependencyScope] > ScopeStrictness[scope]) {
      scope = dependencyScope
    }
  }
  return scope
}

export class Container {
  readonly instances = new Map<ProviderDeclaration, any>()
  private readonly resolvers = new Map<ProviderDeclaration, Promise<any>>()
  private readonly providers = new Set<ProviderDeclaration>()

  constructor(
    private readonly options: {
      context: Extra
      logger: Logger
      loaders: LoaderInterface<Depender<Dependencies>>[]
    },
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

    for (const loader of this.options.loaders) {
      for (const depender of loader.modules.values()) {
        traverse(depender.dependencies)
      }
    }

    const declarations = this.findCurrentScopeDeclarations()
    await Promise.all(declarations.map(this.resolve.bind(this))) // probably allSettled would be better here
  }

  createScope(scope: Scope, params: any = {}) {
    return new Container(this.options, scope, params, this)
  }

  async dispose() {
    // TODO: here might need to find correct order of disposing
    // to prevent first disposal of a provider
    // that other disposing provider depends on
    this.options.logger.debug('Disposing [%s] scope context...', this.scope)
    for (const [{ provider, dependencies }, value] of this.instances) {
      try {
        const { dispose, scope } = provider
        if (scope === this.scope && dispose) {
          const ctx = await this.createContext(dependencies)
          await dispose(merge(ctx, this.params), value)
        }
      } catch (cause) {
        this.options.logger.error(
          new Error('Context disposal error. Potential memory leak', { cause })
        )
      }
    }
    this.instances.clear()
  }

  private findCurrentScopeDeclarations() {
    const declarations: ProviderDeclaration[] = []
    for (const provider of this.providers) {
      if (getProviderScope(provider) === this.scope) {
        declarations.push(provider)
      }
    }
    return declarations
  }

  async resolve<T extends ProviderDeclaration>(
    declaration: T
  ): Promise<ResolvedDependencyInjection<T>> {
    const { factory, scope } = declaration.provider
    const isCurrentScopeStricter =
      ScopeStrictness[this.scope] > ScopeStrictness[scope]
    if (this.parent && isCurrentScopeStricter)
      return this.parent.resolve(declaration)
    if (this.instances.has(declaration)) {
      return this.instances.get(declaration)
    } else if (this.resolvers.has(declaration)) {
      return this.resolvers.get(declaration)
    } else {
      const resolution = new Promise<T>((resolve, reject) => {
        this.createContext(declaration.dependencies)
          .then((ctx) => factory(merge(this.params, ctx)))
          .then((instance) => {
            if (this.scope === scope) this.instances.set(declaration, instance)
            resolve(instance as any)
          })
          .catch(reject)
      }).finally(() => this.resolvers.delete(declaration))
      this.resolvers.set(declaration, resolution)
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
    const context = merge(...extra, this.options.context, {
      injections,
      scope: this.scope,
    })
    return Object.freeze(context)
  }
}

export const declareProvider = (
  provider:
    | ProviderFactory<any, Extra, Extra>
    | Provider<any, Extra, Extra, Scope>,
  dependencies?: Dependencies
) => {
  provider = typeof provider === 'function' ? { factory: provider } : provider
  const declaration = { provider, dependencies }
  declaration.provider.scope = getProviderScope(declaration)
  return declaration
}

export const createTypedDeclareProvider =
  <App, Context extends ExtractAppContext<App> = ExtractAppContext<App>>() =>
  <Type, Deps extends Dependencies, S extends Scope = Scope.Global>(
    provider:
      | ProviderFactory<Type, Context, Deps>
      | Provider<Type, Context, Deps, S>,
    dependencies?: Deps
  ): ProviderDeclaration<Type, Context, Deps, S> => {
    // @ts-expect-error
    return declareProvider(provider, dependencies)
  }
