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

  it('should chain with connection data', () => {
    const newApp = app.withConnectionData<{ some: 'type' }>()
    expect(newApp).toBe(app)
  })

  it('should chain with events', () => {
    const event = testEvent()
    const key = 'testEventName'
    const newApp = app.withEvents({ [key]: event })
    expect(newApp).toBe(app)
    expect(app.loader.events).toHaveProperty(key)
    const registeredEvent = app.loader.events[key]
    expect(registeredEvent.module).toBe(event)
  })

  it('should chain with procedures', () => {
    const procedure = testProcedure().withHandler(() => void 0)
    const key = 'testProcedureName'
    const newApp = app.withProcedures({ [key]: procedure })
    expect(newApp).toBe(app)
    expect(app.loader.procedures).toHaveProperty(key)
    const registeredProcedure = app.loader.procedures[key]
    expect(registeredProcedure.module).toBe(procedure)
  })

  it('should chain with tasks', () => {
    const task = testTask().withHandler(() => void 0)
    const key = 'testTaskName'
    const newApp = app.withTasks({ [key]: task })
    expect(newApp).toBe(app)
    expect(app.loader.tasks).toHaveProperty(key)
    const registeredTask = app.loader.tasks[key]
    expect(registeredTask.module).toBe(task)
  })

  it('should chain with transport', () => {
    const transport = testTransport()
    const newApp = app.withTransport(transport, 'test')
    expect(newApp).toBe(app)
    expect(app.transports).toHaveProperty('test', transport)
  })

  it('should register guard', () => {
    const guard = new Provider().withValue(() => true)
    app.registerGuard(guard)
    expect(app.guards.has(guard)).toBe(true)
  })

  it('should register middleware', () => {
    const middleware = new Provider().withValue(() => true)
    app.registerMiddleware(middleware)
    expect(app.middlewares.has(middleware)).toBe(true)
  })

  it('should register command', () => {
    const command = () => void 0
    app.registerCommand('test', 'test', command)
    expect(app.commands.get('test')?.get('test')).toBe(command)
  })

  it('should register filter', () => {
    app.registerFilter(Error, () => new Error())
    expect(app.filters.has(Error)).toBe(true)
  })

  it('should register interceptor', () => {
    const provider = new Provider().withValue(() => 'test')
    app.registerConnection(provider)
    expect(app.api.connection).toBe(provider)
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

  it('should create connection', () => {
    const connection = app.connection()
    expect(connection).toBeInstanceOf(Provider)
  })

  it('should create event', () => {
    const event = app.event()
    expect(event).toBeInstanceOf(Event)
  })
})
