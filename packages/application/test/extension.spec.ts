import { Application } from '@/application'
import { BaseExtension } from '@/extension'
import { WorkerType } from '@/types'
import { Provider, noop } from 'index'
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
    expect(extension.application).toHaveProperty('loader', app.loader)
    expect(extension.application).toHaveProperty('connections', expect.any(Map))
    expect(extension.application).toHaveProperty(
      'registerHook',
      expect.any(Function),
    )
    expect(extension.application).toHaveProperty(
      'registerMiddleware',
      expect.any(Function),
    )
    expect(extension.application).toHaveProperty(
      'registerCommand',
      expect.any(Function),
    )
    expect(extension.application).toHaveProperty(
      'registerFilter',
      expect.any(Function),
    )
  })

  it('should register commands', async () => {
    const extension = new TestExtension()
    const alias = 'test'
    app.withExtension(extension, alias)
    const fn = () => {}
    extension.application.registerCommand('test', fn)
    expect(app.commands.get(alias)?.get('test')).toBe(fn)
  })

  it('should register hooks', async () => {
    const extension = new TestExtension()
    const alias = 'test'
    app.withExtension(extension, alias)
    const fn = () => {}
    extension.application.registerHook('test', fn)
    expect(app.hooks.get('test')?.has(fn)).toBe(true)
  })

  it('should register filters', async () => {
    const extension = new TestExtension()
    const alias = 'test'
    app.withExtension(extension, alias)
    const fn = () => new Error()
    extension.application.registerFilter(Error, fn)
    expect(app.filters.get(Error)).toBe(fn)
  })

  it('should register middleware', async () => {
    const extension = new TestExtension()
    const alias = 'test'
    app.withExtension(extension, alias)
    const middleware = new Provider().withValue(noop)
    extension.application.registerMiddleware(middleware)
    expect(app.middlewares.has(middleware)).toBe(true)
  })
})
