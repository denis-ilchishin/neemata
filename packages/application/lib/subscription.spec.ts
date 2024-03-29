import { testApp } from '@test/_utils'
import type { Application } from './application'
import type { Event } from './events'
import { BaseSubscriptionManager, type Subscription } from './subscription'

export class TestSubscriptionManager extends BaseSubscriptionManager {
  name = 'Test subscription manager'

  initialize() {}

  context(): {} {
    return {}
  }

  async subscribe(subscription: Subscription) {}

  async unsubscribe(subscription: Subscription): Promise<boolean> {
    return true
  }

  async publish(event: Event, key: string, payload: any): Promise<boolean> {
    return true
  }
}

describe.sequential('Subscription manager', () => {
  let app: Application

  beforeEach(() => {
    app = testApp()
  })

  it('should initialize', async () => {
    const manager = new TestSubscriptionManager()
    const initSpy = vi.spyOn(manager, 'initialize')
    app.registerSubscriptionManager(manager)
    expect(app.subManager).toEqual(manager)
    expect(manager.application).toBeDefined()
    await app.initialize()
    expect(initSpy).toHaveBeenCalledOnce()
  })

  it('should assign an app', async () => {
    const manager = new TestSubscriptionManager()
    app.registerSubscriptionManager(manager)
    // app.eventManager.
  })

  // it('should register commands', async () => {
  //   const extension = new TestExtension()
  //   const alias = 'test'
  //   app.withExtension(extension, alias)
  //   const fn = () => {}
  //   extension.application.registerCommand('test', fn)
  //   expect(app.commands.get(alias)?.get('test')).toBe(fn)
  // })

  // it('should register hooks', async () => {
  //   const extension = new TestExtension()
  //   const alias = 'test'
  //   app.withExtension(extension, alias)
  //   const fn = () => {}
  //   extension.application.registerHook('test', fn)
  //   expect(app.hooks.get('test')?.has(fn)).toBe(true)
  // })

  // it('should register filters', async () => {
  //   const extension = new TestExtension()
  //   const alias = 'test'
  //   app.withExtension(extension, alias)
  //   const fn = () => new Error()
  //   extension.application.registerFilter(Error, fn)
  //   expect(app.filters.get(Error)).toBe(fn)
  // })

  // it('should register middleware', async () => {
  //   const extension = new TestExtension()
  //   const alias = 'test'
  //   app.withExtension(extension, alias)
  //   const middleware = new Provider().withValue(noop)
  //   extension.application.registerMiddleware(middleware)
  //   expect(app.middlewares.has(middleware)).toBe(true)
  // })
})
