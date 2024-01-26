import { Application } from '@/application'
import { Provider } from '@/container'
import { BaseCustomLoader, Loader } from '@/loader'
import { Scope } from '@/types'
import { noop } from '@/utils/functions'
import { testApp, testEvent, testProcedure, testTask } from './_utils'

class TestCustomLoader implements BaseCustomLoader {
  async load() {
    return {
      procedures: {
        test: {
          module: testProcedure().withHandler(noop),
          exportName: '',
          path: '',
        },
      },
      tasks: {
        test: {
          module: testTask().withHandler(noop),
          exportName: '',
          path: '',
        },
      },
      events: {
        test: {
          module: testEvent(),
          exportName: '',
          path: '',
        },
      },
    }
  }

  paths() {
    return []
  }
}

describe.sequential('Loader', () => {
  let app: Application
  let loader: Loader

  beforeEach(() => {
    app = testApp({ loaders: [new TestCustomLoader()] })
    loader = app.loader
  })

  it('should be a loader', () => {
    expect(loader).toBeDefined()
    expect(loader).toBeInstanceOf(Loader)
  })

  it('should load', async () => {
    await loader.load()
    expect(loader.procedures).toHaveProperty('test')
    expect(loader.tasks).toHaveProperty('test')
    expect(loader.events).toHaveProperty('test')
  })
})

describe.sequential('Loader -> Procedure', () => {
  let app: Application
  let loader: Loader

  beforeEach(() => {
    app = testApp()
    loader = app.loader
  })

  it('should register procedure', async () => {
    const procedure = testProcedure().withHandler(noop)
    loader.register('procedures', procedure.name, procedure)
    expect(loader.procedure('test')).toBe(procedure)
  })

  it('should fail register procedure without handler', async () => {
    const procedure = testProcedure()
    expect(() =>
      loader.register('procedures', procedure.name, procedure),
    ).toThrow()
  })

  it('should fail register duplicate procedure', async () => {
    const procedure = testProcedure().withHandler(noop)
    loader.register('procedures', procedure.name, procedure)
    expect(() =>
      loader.register('procedures', procedure.name, procedure),
    ).toThrow()
  })

  it('should fail register procedure with invalid guards', async () => {
    const guard = new Provider().withScope(Scope.Connection)
    const guard2 = new Provider().withScope(Scope.Call)
    const procedure = testProcedure()
      .withHandler(noop)
      .withGuards(guard, guard2)
    expect(() =>
      loader.register('procedures', procedure.name, procedure),
    ).toThrow()
  })

  it('should fail register procedure with invalid middleware', async () => {
    const middleware = new Provider().withScope(Scope.Connection)
    const middleware2 = new Provider().withScope(Scope.Call)
    const procedure = testProcedure()
      .withHandler(noop)
      .withMiddlewares(middleware, middleware2)
    expect(() =>
      loader.register('procedures', procedure.name, procedure),
    ).toThrow()
  })

  it('should fail register procedure with invalid middleware', async () => {
    const middleware = new Provider().withScope(Scope.Connection)
    const middleware2 = new Provider().withScope(Scope.Call)
    const procedure = testProcedure()
      .withHandler(noop)
      .withMiddlewares(middleware, middleware2)
    expect(() =>
      loader.register('procedures', procedure.name, procedure),
    ).toThrow()
  })
})

describe.sequential('Loader -> Task', () => {
  let app: Application
  let loader: Loader

  beforeEach(() => {
    app = testApp()
    loader = app.loader
  })

  it('should register task', async () => {
    const task = testTask().withHandler(noop)
    loader.register('tasks', task.name, task)
    expect(loader.task(task.name)).toBe(task)
  })

  it('should fail register task without handler', async () => {
    const task = testTask()
    expect(() => loader.register('tasks', task.name, task)).toThrow()
  })

  it('should fail register duplicate task', async () => {
    const task = testTask().withHandler(noop)
    loader.register('tasks', task.name, task)
    expect(() => loader.register('tasks', task.name, task)).toThrow()
  })

  it('should fail register task with non-global dependencies', async () => {
    const provider = new Provider().withScope(Scope.Connection)
    const task = testTask().withHandler(noop).withDependencies({ provider })
    expect(() => loader.register('tasks', task.name, task)).toThrow()
  })
})

describe.sequential('Loader -> Event', () => {
  let app: Application
  let loader: Loader

  beforeEach(() => {
    app = testApp()
    loader = app.loader
  })

  it('should register event', async () => {
    const event = testEvent()
    loader.register('events', event.name, event)
    expect(loader.event(event.name)).toBe(event)
  })

  it('should fail register duplicate event', async () => {
    const event = testEvent()
    loader.register('events', event.name, event)
    expect(() => loader.register('events', event.name, event)).toThrow()
  })
})
