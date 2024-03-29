import { testApp } from '@test/_utils'
import { Filter, Middleware } from './api'
import type { Application } from './application'
import { Provider } from './container'
import { BaseExtension } from './extension'
import { APP_COMMAND, Registry } from './registry'
import { type FilterFn, type MiddlewareFn, WorkerType } from './types'
import { noop } from './utils/functions'

export class TestExtension extends BaseExtension {
  name = 'Test extension'

  initialize() {}

  context(): {} {
    return {}
  }
}

describe.sequential('Extension', () => {
  let app: Application
  let extension: TestExtension
  const alias = 'test'
  const registryPrefix = 'test'

  beforeEach(() => {
    extension = new TestExtension()
    app = testApp()
    app.registerExtension(extension)
  })

  it('should initialize', async () => {
    const extension = new TestExtension()
    const app = testApp()
    const initSpy = vi.spyOn(extension, 'initialize')
    app.registerExtension(extension)
    expect(app.extensions.has(extension)).toBe(true)
    expect(extension.application).toBeDefined()
    await app.initialize()
    expect(initSpy).toHaveBeenCalledOnce()
  })

  it('should assign an app', async () => {
    const extension = new TestExtension()
    app.registerExtension({ extension, options: { namespace: alias } })
    expect(extension.application).toHaveProperty('type', WorkerType.Api)
    expect(extension.application).toHaveProperty('api', app.api)
    expect(extension.application).toHaveProperty('container', app.container)
    expect(extension.application).toHaveProperty('logger')
    expect(extension.application).toHaveProperty('connections', expect.any(Map))
    expect(extension.application).toHaveProperty('registry')
    expect(extension.application.registry).toBeInstanceOf(Registry)
    expect(extension.application.registry.options).toStrictEqual({
      namespace: alias,
    })
  })

  it('should register global commands', async () => {
    const fn = () => {}
    extension.application.registry.registerCommand('test', fn)
    expect(app.registry.commands.get(APP_COMMAND)?.get('test')).toBe(fn)
  })

  it('should register namespaced commands', async () => {
    const extension = new TestExtension()
    app.registerExtension({ extension, options: { namespace: alias } })
    const fn = () => {}
    extension.application.registry.registerCommand('test', fn)
    expect(app.registry.commands.get(registryPrefix)?.get('test')).toBe(fn)
  })

  it('should register hooks', async () => {
    const fn = () => {}
    extension.application.registry.registerHook('test', fn)
    expect(app.registry.hooks.get('test')?.has(fn)).toBe(true)
  })

  it('should register filters', async () => {
    const filter = new Filter().withValue((() => new Error()) as FilterFn)
    extension.application.registry.registerFilter(Error, filter)
    expect(app.registry.filters.get(Error)).toBe(filter)
  })

  it('should register middleware', async () => {
    const middleware = new Middleware().withValue(noop as MiddlewareFn)
    extension.application.registry.registerMiddleware(middleware)
    expect(app.registry.middlewares.has(middleware)).toBe(true)
  })
})
