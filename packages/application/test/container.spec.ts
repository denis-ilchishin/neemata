import { Application } from '@/application'
import { Container, Provider, getProviderScope } from '@/container'
import { EventManager } from '@/events'
import { Scope } from '@/types'
import { testApp, testProcedure } from './_utils'

describe.sequential('Provider', () => {
  let provider: Provider

  beforeEach(() => {
    provider = new Provider()
  })

  it('should be a provider', () => {
    expect(provider).toBeDefined()
    expect(provider).toBeInstanceOf(Provider)
  })

  it('should clone with a value', () => {
    const value = () => {}
    const newProvider = provider.withValue(value)
    expect(newProvider.value).toBe(value)
    expect(newProvider).not.toBe(provider)
  })

  it('should clone with a factory', () => {
    const factory = () => {}
    const newProvider = provider.withFactory(factory)
    expect(newProvider.factory).toBe(factory)
    expect(newProvider).not.toBe(provider)
  })

  it('should clone with a disposal', () => {
    const dispose = () => {}
    const newProvider = provider.withDisposal(dispose)
    expect(newProvider.dispose).toBe(dispose)
    expect(newProvider).not.toBe(provider)
  })

  it('should clone with a scope', () => {
    const newProvider = provider.withScope(Scope.Call)
    expect(newProvider.scope).toBe(Scope.Call)
    expect(newProvider).not.toBe(provider)
  })

  it('should clone with a options', () => {
    let newProvider = provider.withOptions({ some: 'option' })
    expect(newProvider.options).to.deep.eq({ some: 'option' })
    expect(newProvider).not.toBe(provider)
    newProvider = provider.withOptions({ some: 'option', other: 'option' })
    expect(newProvider.options).to.deep.eq({ some: 'option', other: 'option' })
    expect(newProvider.scope).not.toBe(Scope.Transient)
  })

  it('should clone with a dependencies', () => {
    const dep1 = new Provider().withValue('dep1')
    const dep2 = new Provider().withValue('dep2')

    const newProvider = provider.withDependencies({ dep1 })
    const newProvider2 = newProvider.withDependencies({ dep2 })

    expect(newProvider2.dependencies).toHaveProperty('dep1', dep1)
    expect(newProvider2.dependencies).toHaveProperty('dep2', dep2)

    expect(newProvider2).not.toBe(newProvider)
    expect(newProvider2).not.toBe(provider)
  })

  it('should clone with a description', () => {
    const newProvider = provider.withDescription('description')
    expect(newProvider.description).toBe('description')
    expect(newProvider).not.toBe(provider)
  })

  it('should clone with options type', () => {
    const newProvider = provider.withOptionsType<number>().withOptions(1)
    expect(newProvider).not.toBe(provider)
  })
})

describe.sequential('Container', () => {
  let app: Application
  let container: Container

  beforeEach(async () => {
    app = testApp()
    await app.initialize()
    container = app.container
  })

  afterEach(async () => {
    await app?.terminate()
  })

  it('should create context', async () => {
    const dep = new Provider().withValue('dep')
    const ctx = await container.createContext({ dep }, { extra: 'value' })
    expect(ctx).toHaveProperty('context')
    expect(ctx.context.extra).toBe('value')
  })

  it('should be a container', () => {
    expect(container).toBeDefined()
    expect(container).instanceOf(Container)
  })

  it('should resolve with value', async () => {
    const provider = new Provider().withValue('value')
    expect(await container.resolve(provider)).toBe('value')
  })

  it('should resolve with factory', async () => {
    const provider = new Provider().withFactory(() => 'value')
    expect(await container.resolve(provider)).toBe('value')
  })

  it('should provide context', async () => {
    const provider = new Provider().withFactory((ctx) => ctx)
    const ctx = await container.resolve(provider)
    expect(ctx).toHaveProperty('context')
    expect(ctx.context).toHaveProperty('logger')
    expect(ctx.context).toHaveProperty('execute')
    expect(ctx.context).toHaveProperty('eventManager')

    expect(ctx.context.eventManager).toBeInstanceOf(EventManager)
    expect(typeof ctx.context.execute).toBe('function')
  })

  it('should provide dependencies', async () => {
    const dep1 = new Provider().withValue('dep1')
    const dep2 = new Provider()
      .withDependencies({ dep1 })
      .withFactory(({ dep1 }) => ({ dep1 }))
    const dep3 = new Provider().withFactory(() => 'dep3')
    const provider = new Provider()
      .withDependencies({ dep2, dep3 })
      .withFactory(({ ...deps }) => deps)
    const deps = await container.resolve(provider)
    expect(deps).toHaveProperty('dep2')
    expect(deps).toHaveProperty('dep3')
    expect(deps).toHaveProperty('dep2.dep1')
    expect(deps.dep2.dep1).toBe('dep1')
  })

  it('should dispose', async () => {
    const provider = new Provider()
      .withFactory(() => ({}))
      .withDisposal(() => {})
    const spy = vi.spyOn(provider, 'dispose')
    await container.resolve(provider)
    await container.dispose()
    expect(spy).toHaveBeenCalledOnce()
  })

  it('should provide with options', async () => {
    const options = {}
    const provider = new Provider().withFactory((ctx, options) => options)
    expect(await container.resolve(provider.withOptions(options))).toBe(options)
  })

  it('should be cached', async () => {
    const provider = new Provider().withFactory(() => ({}))
    const val = await container.resolve(provider)
    expect(container.isResolved(provider)).toBe(true)
    expect(await container.resolve(provider)).toBe(val)
  })

  it('should handle dispose error', async () => {
    const provider = new Provider()
      .withFactory(() => {})
      .withDisposal(() => {
        throw new Error()
      })
    await container.resolve(provider)
    await expect(container.dispose()).resolves.not.toThrow()
  })

  it('should handle concurrent resolutions', async () => {
    const provider = new Provider()
      .withFactory(async () => {
        await new Promise((resolve) => setTimeout(resolve, 1))
        return {}
      })
      .withDisposal(() => {
        throw new Error()
      })
    const res1 = container.resolve(provider)
    const res2 = container.resolve(provider)
    expect(res1).toBe(res2)
  })

  it('should create scoped container', async () => {
    const scopeContainer = container.createScope(Scope.Call)
    expect(scopeContainer).toBeInstanceOf(Container)
    expect(scopeContainer).not.toBe(container)
    expect(scopeContainer).toHaveProperty('parent')
  })

  it('should resolve scopes', async () => {
    const globalProvider = new Provider()
      .withScope(Scope.Global)
      .withFactory(() => ({}))

    const connectionProvider = new Provider()
      .withScope(Scope.Connection)
      .withDependencies({
        globalValue: globalProvider,
      })
      .withFactory(({ globalValue }) => {
        return { globalValue }
      })

    const callProvider = new Provider()
      .withScope(Scope.Connection)
      .withDependencies({
        connectionValue: connectionProvider,
        globalValue: globalProvider,
      })
      .withFactory(({ globalValue, connectionValue }) => {
        return { globalValue, connectionValue }
      })

    const globalProviderValue = await container.resolve(globalProvider)
    const scopeContainer = container.createScope(Scope.Call)

    const callProviderValue = await scopeContainer.resolve(callProvider)

    expect(scopeContainer.instances.has(globalProvider)).toBe(false)
    expect(scopeContainer.instances.has(connectionProvider)).toBe(true)
    expect(callProviderValue.globalValue).toBe(globalProviderValue)

    const connectionProviderValue =
      await scopeContainer.resolve(connectionProvider)
    expect(callProviderValue.globalValue).toBe(
      connectionProviderValue.globalValue,
    )
    expect(scopeContainer.isResolved(globalProvider)).toBe(true)
  })

  it('should correctly resolve provider scope', async () => {
    const provider = new Provider().withScope(Scope.Connection)
    const provider2 = new Provider().withScope(Scope.Call)
    const provider3 = new Provider().withDependencies({ provider, provider2 })
    expect(getProviderScope(provider3)).toBe(Scope.Call)
  })

  it('should preload global dependencies', async () => {
    const factory1 = vi.fn(() => ({}))
    const provider1 = new Provider()
      .withScope(Scope.Global)
      .withFactory(factory1)
    const factory2 = vi.fn(() => ({}))
    const provider2 = new Provider()
      .withScope(Scope.Connection)
      .withFactory(factory2)
    const procedure = testProcedure()
      .withDependencies({ provider1, provider2 })
      .withHandler(() => {})
    app.loader.register('procedures', 'test', procedure)
    await app.container.load()
    expect(factory1).toHaveBeenCalledOnce()
    expect(factory2).not.toHaveBeenCalled()
  })
})
