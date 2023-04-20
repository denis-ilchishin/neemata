const { join } = require('path')
const { Loader } = require('./loader')

const Scope = {
  Call: 'call',
  Connection: 'connection',
  Default: 'default',
}

const _scopeStrictness = {
  [Scope.Default]: 0,
  [Scope.Connection]: 1,
  [Scope.Call]: 2,
}

const providerSymbol = Symbol('neemata:provider')

class DependencyContainer {
  constructor(workerApp) {
    this._workerApp = workerApp

    const path = (part) => join(workerApp.rootPath, part)
    const logErrors = (workerApp.workerId = 1)

    this._namespaces = {
      lib: new Loader(path('lib'), { logErrors }),
      config: new Loader(path('config'), { recursive: false, logErrors }),
      db: new Loader(path('db'), { recursive: false, logErrors }),
      service: new Loader(path('service'), { logErrors }),
      api: new Loader(path('api', { logErrors })),
    }

    this._registry = new Map()
    this._cache = new Map()
  }

  factory() {
    const container = new DependencyContainer(this._workerApp)
    container._registry = this._registry
    container._cache = new Map(this._cache)
    return container
  }

  async load() {
    try {
      await this._preload()
      await this.preload()
    } catch (error) {
      logger.error(error)
    }
  }

  async unload() {
    for (const [name, factory] of this._registry) {
      const dispose = factory.dispose
      if (dispose) {
        const cached = this._cache.get(name)
        if (cached) await dispose(cached)
      }
    }

    this._cache.clear()
    this._registry.clear()
  }

  async resolve(providerName, ctx) {
    const provider = this._registry.get(providerName)

    const resolveDeps = async () =>
      Object.fromEntries(
        await Promise.all(
          provider.deps.map(async (dep) => [dep, await this.resolve(dep, ctx)])
        )
      )

    if (this._cache.has(providerName)) return this._cache.get(providerName)
    const deps = await resolveDeps()
    return this._cache
      .set(providerName, await provider.factory({ deps, ctx }))
      .get(providerName)
  }

  async _preload() {
    const resolved = await Promise.all(
      Object.entries(this._namespaces).map(async ([namespace, loader]) => [
        namespace,
        await loader.load(namespace),
      ])
    )

    for (const [namespace, entries] of resolved) {
      for (const { exports, ...entryData } of entries) {
        this._registry.set(
          namespace === 'api' ? entryData.alias : entryData.name,
          {
            ...entryData,
            ...exports,
            deps: Object.entries(exports.deps || {})
              .filter((dep) => dep[1] === true)
              .map((dep) => dep[0]),
          }
        )
      }
    }

    this._checkDependencies()
    this._checkCircularDependency()
    this._resolveDependenciesScopes()
  }

  _checkDependencies() {
    for (const providerName of this._registry.keys()) {
      for (const depName of this._registry.get(providerName).deps) {
        if (!this._registry.has(depName)) {
          throw new Error(`Dependency ${depName} is not found`)
        }
      }
    }
  }

  _checkCircularDependency() {
    // Lookup for circular dependencies
    const checked = new Set()
    const delectCirDep = (provider, stack) => {
      checked.add(provider)
      stack.push(provider)
      for (const dep of this._registry.get(provider).deps) {
        if (!checked.has(dep)) {
          if (delectCirDep(dep, stack)) return stack
        } else if (stack.includes(dep)) return stack
      }
      stack.pop()
      return false
    }

    for (const provider of this._registry.keys()) {
      if (!checked.has(provider)) {
        const result = delectCirDep(provider, [])
        if (result) {
          throw new Error(
            `Circular dependency detected: ${result.join(' -> ')}`
          )
        }
      }
    }
  }

  _resolveDependenciesScopes() {
    const findStrictestScope = (provider) => {
      let strictestScope = provider.scope
      for (const dep of provider.deps) {
        const provider = this._registry.get(dep)
        const isStricter =
          _scopeStrictness[provider.scope] > _scopeStrictness[strictestScope]
        if (isStricter) strictestScope = provider.scope
      }
      return strictestScope
    }

    for (const provider of Object.values(this._registry)) {
      provider.scope = findStrictestScope(provider)
    }
  }

  async preload(scope = Scope.Default, ctx = undefined) {
    for (const [name, provider] of this._registry) {
      if (_scopeStrictness[provider.scope] <= _scopeStrictness[scope])
        await this.resolve(name, ctx)
    }
  }
}

module.exports = {
  DependencyContainer,
  Scope,
  providerSymbol,
}
