import { Application } from '@/application'
import { BaseExtension } from '@/extension'
import { WorkerType } from '@/types'
import { Provider } from '@/container'
import { noop } from '@/utils/functions'
import { testApp } from './_utils'

export class TestExtension extends BaseExtension {
  name = 'Test extension'

  initialize() {}

  context(): {} {
    return {}
  }
}

describe.sequential('Extension', () => {
  let app: Application

  beforeEach(() => {
    app = testApp()
  })

  it('should initialize', async () => {
    const extension = new TestExtension()
    const alias = 'test'
    const initSpy = vi.spyOn(extension, 'initialize')
    const contextSpy = vi.spyOn(extension, 'context')

    app.withExtension(extension, alias)
    expect(app.extensions).toHaveProperty(alias, extension)
    expect(extension.application).toBeDefined()
    await app.initialize()
    expect(initSpy).toHaveBeenCalledOnce()
    expect(contextSpy).toHaveBeenCalledOnce()
  })

  it('should assign an app', async () => {
    const extension = new TestExtension()
    const alias = 'test'
    app.withExtension(extension, alias)
    expect(extension.application).toHaveProperty('type', WorkerType.Api)
    expect(extension.application).toHaveProperty('api', app.api)
    expect(extension.application).toHaveProperty('container', app.container)
    expect(extension.application).toHaveProperty('logger')
    expect(extension.application).toHaveProperty('registry', app.registry)
    expect(extension.application).toHaveProperty('connections', expect.any(Map))
  })

  it('should register commands', async () => {
    const extension = new TestExtension()
    const alias = 'test'
    app.withExtension(extension, alias)
    const fn = () => {}
    extension.application.registry.registerCommand(alias, 'test', fn)
    expect(app.registry.commands.get(alias)?.get('test')).toBe(fn)
  })

  it('should register hooks', async () => {
    const extension = new TestExtension()
    const alias = 'test'
    app.withExtension(extension, alias)
    const fn = () => {}
    extension.application.registry.registerHook('test', fn)
    expect(app.registry.hooks.get('test')?.has(fn)).toBe(true)
  })

  it('should register filters', async () => {
    const extension = new TestExtension()
    const alias = 'test'
    app.withExtension(extension, alias)
    const filter = new Provider().withValue(() => new Error())
    extension.application.registry.registerFilter(Error, filter)
    expect(app.registry.filters.get(Error)).toBe(filter)
  })

  it('should register middleware', async () => {
    const extension = new TestExtension()
    const alias = 'test'
    app.withExtension(extension, alias)
    const middleware = new Provider().withValue(noop)
    extension.application.registry.registerMiddleware(middleware)
    expect(app.registry.middlewares.has(middleware)).toBe(true)
  })
})
