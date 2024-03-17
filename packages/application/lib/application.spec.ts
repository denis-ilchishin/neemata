import {
  testApp,
  testEvent,
  testProcedure,
  testTask,
  testTransport,
} from '@test/_utils'
import { Guard, Middleware } from './api'
import { Application } from './application'
import { Provider } from './container'
import type { FilterFn, GuardFn, MiddlewareFn } from './types'

describe.sequential('Application', () => {
  let app: Application

  beforeEach(async () => {
    app = testApp()
    await app.initialize()
  })

  afterEach(async () => {
    await app.terminate()
  })

  it('should be an application', () => {
    expect(app).toBeDefined()
    expect(app).instanceOf(Application)
  })

  it('should chain with events', () => {
    const event = testEvent()
    const key = 'testEventName'
    const newApp = app.registerEvents({ [key]: event })
    expect(newApp).toBe(app)
    expect(app.registry.events.has(key)).toBe(true)
    const registeredEvent = app.registry.events.get(key)
    expect(registeredEvent?.module).toBe(event)
  })

  it('should chain with procedures', () => {
    const procedure = testProcedure().withHandler(() => void 0)
    const key = 'testProcedureName'
    const newApp = app.registerProcedures({ [key]: procedure })
    expect(newApp).toBe(app)
    expect(app.registry.procedures.has(key)).toBe(true)
    const registeredProcedure = app.registry.procedures.get(key)
    expect(registeredProcedure?.module).toBe(procedure)
  })

  it('should chain with tasks', () => {
    const task = testTask().withHandler(() => void 0)
    const key = 'testTaskName'
    const newApp = app.registerTasks({ [key]: task })
    expect(newApp).toBe(app)
    expect(app.registry.tasks.has(key)).toBe(true)
    const registeredTask = app.registry.tasks.get(key)
    expect(registeredTask?.module).toBe(task)
  })

  it('should chain with transport', () => {
    const transport = testTransport()
    const newApp = app.registerTransport(transport)
    expect(newApp).toBe(app)
    expect(app.transports.has(transport)).toBe(true)
  })

  it('should register guard', () => {
    const guard = new Guard().withValue((() => true) as GuardFn)
    app.registry.registerGuard(guard)
    expect(app.registry.guards.has(guard)).toBe(true)
  })

  it('should register middleware', () => {
    const middleware = new Middleware().withValue(
      (() => void 0) as MiddlewareFn,
    )
    app.registry.registerMiddleware(middleware)
    expect(app.registry.middlewares.has(middleware)).toBe(true)
  })

  it('should register command', () => {
    const command = () => void 0
    app.registry.registerCommand('test', 'test', command)
    expect(app.registry.commands.get('test')?.get('test')).toBe(command)
  })

  it('should register filter', () => {
    const filter = new Provider().withValue(
      (() => new Error()) as FilterFn<typeof Error>,
    )
    app.registry.registerFilter(Error, filter)
    expect(app.registry.filters.has(Error)).toBe(true)
  })

  it('should register app context', async () => {
    const provider = new Provider()
      .withDependencies({
        logger: app.providers.logger,
        execute: app.providers.execute,
        eventManager: app.providers.eventManager,
      })
      .withFactory((ctx) => ctx)

    const ctx = await app.container.resolve(provider)

    expect(ctx).toBeDefined()
    expect(ctx).toHaveProperty('logger', app.logger)
    expect(ctx).toHaveProperty('execute', expect.any(Function))
    expect(ctx).toHaveProperty('eventManager', app.eventManager)
  })
})
