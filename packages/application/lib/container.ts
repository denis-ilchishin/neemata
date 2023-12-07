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
  ProviderDeclarationWithOptions,
  ProviderFactory,
  ResolvedDependencyInjection,
} from './types'
import { merge } from './utils/functions'

const ScopeStrictness = {
  [Scope.Global]: 0,
  [Scope.Connection]: 1,
  [Scope.Call]: 2,
}

type DeclarationType = ProviderDeclaration | ProviderDeclarationWithOptions

export function getProviderScope(value: DeclarationType) {
  const declaration = getDeclaration(value)
  let scope = declaration.provider.scope ?? Scope.Global
  for (const dependency of Object.values(declaration.dependencies ?? {})) {
    const dependencyScope = getProviderScope(dependency)
    if (ScopeStrictness[dependencyScope] > ScopeStrictness[scope]) {
      scope = dependencyScope
    }
  }
  return scope
}

function getDeclaration(value: DeclarationType) {
  return 'declaration' in value ? value.declaration : value
}

export class Container {
  readonly instances = new Map<DeclarationType, any>()
  private readonly resolvers = new Map<DeclarationType, Promise<any>>()
  private readonly providers = new Set<DeclarationType>()

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
    for (const [key, value] of this.instances) {
      const declaration = getDeclaration(key)
      const { provider, dependencies } = declaration
      try {
        const { dispose } = provider
        if (dispose) {
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
    this.providers.clear()
  }

  private findCurrentScopeDeclarations() {
    const declarations: DeclarationType[] = []
    for (const provider of this.providers) {
      if (getProviderScope(provider) === this.scope) {
        declarations.push(provider)
      }
    }
    return declarations
  }

  has(value: any) {
    return this.instances.has(value) || this.resolvers.has(value)
  }

  async resolve<T extends ProviderDeclaration | ProviderDeclarationWithOptions>(
    value: T
  ): Promise<
    ResolvedDependencyInjection<
      T extends ProviderDeclarationWithOptions ? T['declaration'] : T
    >
  > {
    const declaration = getDeclaration(value)
    const options: any = 'options' in value ? value.options : undefined
    const { factory, scope } = declaration.provider

    if (this.instances.has(value)) {
      return this.instances.get(value)
    } else if (this.resolvers.has(value)) {
      return this.resolvers.get(value)
    } else {
      const isCurrentScopeStricter =
        ScopeStrictness[this.scope] > ScopeStrictness[scope]
      if (this.parent && isCurrentScopeStricter && this.parent.has(value))
        return this.parent.resolve(value)
      const resolution = this.createContext(declaration.dependencies)
        .then((ctx) => factory(merge(this.params, ctx), options))
        .then((instance) => {
          this.instances.set(value, instance)
          this.resolvers.delete(value)
          return instance
        })
      this.resolvers.set(value, resolution)
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
    | ProviderFactory<any, Extra, Extra, any[]>
    | Provider<any, Extra, Extra, Scope, any[]>,
  dependencies?: Dependencies
) => {
  const declarationFactory = (options) => ({ declaration, options })
  provider = typeof provider === 'function' ? { factory: provider } : provider
  const declaration = Object.assign(declarationFactory, {
    provider,
    dependencies,
  })
  // @ts-expect-error
  declaration.provider.scope = getProviderScope(declaration)
  return declaration
}

export const createTypedDeclareProvider =
  <App, Context extends ExtractAppContext<App> = ExtractAppContext<App>>() =>
  <
    Type,
    Deps extends Dependencies,
    Options extends any,
    ProviderScope extends Scope = Scope.Global
  >(
    provider:
      | ProviderFactory<Type, Context, Deps, Options>
      | Provider<Type, Context, Deps, ProviderScope, Options>,
    dependencies?: Deps
  ): ProviderDeclaration<Type, Context, Deps, ProviderScope, Options> => {
    // @ts-expect-error
    return declareProvider(provider, dependencies)
  }
