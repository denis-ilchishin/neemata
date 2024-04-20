import { TestExtension, TestTransport, testApp } from '@test/_utils'
import { Application } from './application'
import {
  EVENT_MANAGER_PROVIDER,
  EXECUTE_PROVIDER,
  LOGGER_PROVIDER,
  Provider,
} from './container'
import { Module } from './module'

describe.sequential('Application', () => {
  let app: Application

  beforeEach(async () => {
    app = testApp()
    await app.initialize()
    app.registerTransport(TestTransport)
  })

  afterEach(async () => {
    await app.terminate()
  })

  it('should be an application', () => {
    expect(app).toBeDefined()
    expect(app).instanceOf(Application)
  })

  it('should register extension', () => {
    const newApp = app.registerExtension(TestExtension)
    expect(newApp).toBe(app)
    for (const appExtension of app.extensions) {
      expect(appExtension).toBeInstanceOf(TestExtension)
      expect(appExtension).toHaveProperty(
        'application',
        expect.objectContaining({
          type: app.options.type,
          api: app.api,
          connections: {
            add: expect.any(Function),
            get: expect.any(Function),
            remove: expect.any(Function),
          },
          container: app.container,
          registry: app.registry,
          logger: expect.any(Object),
        }),
      )
    }
  })

  it('should register transport', () => {
    const newApp = app.registerTransport(TestTransport)
    expect(newApp).toBe(app)
    const appTransport = app.transports.values().next().value
    expect(appTransport).toBeInstanceOf(TestTransport)
  })

  it('should register app context', async () => {
    const provider = new Provider()
      .withDependencies({
        logger: LOGGER_PROVIDER,
        execute: EXECUTE_PROVIDER,
        eventManager: EVENT_MANAGER_PROVIDER,
      })
      .withFactory((dependencies) => dependencies)

    const ctx = await app.container.resolve(provider)

    expect(ctx).toBeDefined()
    expect(ctx).toHaveProperty('logger', app.logger)
    expect(ctx).toHaveProperty('execute', expect.any(Function))
    expect(ctx).toHaveProperty('eventManager', app.eventManager)
  })

  it('should initialize modules', async () => {
    const initializer = vi.fn()
    const module = new Module().withInitializer(initializer)
    app.registerModules({ test: module })
    await app.initialize()
    expect(initializer).toHaveBeenCalledWith({
      container: app.container,
      hooks: app.registry.hooks,
      logger: app.logger,
    })
  })
})
