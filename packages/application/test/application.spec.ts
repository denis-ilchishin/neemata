import { Procedure } from '@/api'
import { Application } from '@/application'
import { Provider } from '@/container'
import { Event } from '@/events'
import { Task } from '@/tasks'
import {
  testApp,
  testEvent,
  testProcedure,
  testTask,
  testTransport,
} from './_utils'

describe.sequential('Application', () => {
  let app: Application

  beforeEach(() => {
    app = testApp()
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
    const newApp = app.registerTransports({ test: transport })
    expect(newApp).toBe(app)
    expect(app.transports).toHaveProperty('test', transport)
  })

  it('should register guard', () => {
    const guard = new Provider().withValue(() => true)
    app.registry.registerGuard(guard)
    expect(app.registry.guards.has(guard)).toBe(true)
  })

  it('should register middleware', () => {
    const middleware = new Provider().withValue(() => true)
    app.registry.registerMiddleware(middleware)
    expect(app.registry.middlewares.has(middleware)).toBe(true)
  })

  it('should register command', () => {
    const command = () => void 0
    app.registry.registerCommand('test', 'test', command)
    expect(app.registry.commands.get('test')?.get('test')).toBe(command)
  })

  it('should register filter', () => {
    app.registry.registerFilter(
      Error,
      new Provider().withValue(() => new Error()),
    )
    expect(app.registry.filters.has(Error)).toBe(true)
  })

  it('should create procedure', () => {
    const procedure = app.procedure()
    expect(procedure).toBeInstanceOf(Procedure)
  })

  it('should create provider', () => {
    const provider = app.provider()
    expect(provider).toBeInstanceOf(Provider)
  })

  it('should create task', () => {
    const task = app.task()
    expect(task).toBeInstanceOf(Task)
  })

  it('should create middleware', () => {
    const middleware = app.middleware()
    expect(middleware).toBeInstanceOf(Provider)
  })

  it('should create guard', () => {
    const guard = app.guard()
    expect(guard).toBeInstanceOf(Provider)
  })

  it('should create event', () => {
    const event = app.event()
    expect(event).toBeInstanceOf(Event)
  })
})
