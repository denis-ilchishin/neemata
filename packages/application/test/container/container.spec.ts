import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Application } from '@/application'
import { Container, Provider } from '@/container'
import { EventManager } from '@/events'
import { Scope } from '@/types'
import { defaultApp } from '../_app'

describe.sequential('Container', () => {
  let app: Application
  let container: Container

  beforeEach(async () => {
    app = defaultApp()
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

    const connectionProviderValue = await scopeContainer.resolve(
      connectionProvider
    )
    expect(callProviderValue.globalValue).toBe(
      connectionProviderValue.globalValue
    )
  })
})
