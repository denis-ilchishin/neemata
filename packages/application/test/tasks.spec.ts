import { Application } from '@/application'
import { Provider } from '@/container'
import { Task, Tasks } from '@/tasks'
import { createFuture, defer, noop, onAbort } from '@/utils/functions'
import { defaultTimeout, testApp, testTask, testTaskRunner } from './_utils'

describe.sequential('Task', () => {
  let task: Task

  beforeEach(() => {
    task = testTask().withHandler(noop)
  })

  it('should be a task', () => {
    expect(task).toBeDefined()
    expect(task).toBeInstanceOf(Task)
  })

  it('should clone with a name', () => {
    const newTask = task.withName('name')
    expect(newTask.name).toBe('name')
    expect(newTask).not.toBe(task)
  })

  it('should clone with a handler', () => {
    const handler = () => {}
    const newTask = task.withHandler(handler)
    expect(newTask.handler).toBe(handler)
    expect(newTask).not.toBe(task)
  })

  it('should clone with a parser', () => {
    const parser = (...args: any[]): any => {}
    const newTask = task.withParser(parser)
    expect(newTask.parser).toBe(parser)
    expect(newTask).not.toBe(task)
  })

  it('should clone with a dependencies', () => {
    const dep1 = new Provider().withValue('dep1')
    const dep2 = new Provider().withValue('dep2')
    const newTask = task.withDependencies({
      dep1,
    })
    const newTask2 = newTask.withDependencies({
      dep2,
    })
    expect(newTask2.dependencies).toHaveProperty('dep1', dep1)
    expect(newTask2.dependencies).toHaveProperty('dep2', dep2)
    expect(newTask2).not.toBe(task)
  })

  it('should clone with args', () => {
    const newTask = task.withArgs<['arg1', 'arg2']>()
    expect(newTask).not.toBe(task)
  })
})

describe.sequential('Tasks', () => {
  let app: Application
  let tasks: Tasks

  beforeEach(async () => {
    app = testApp()
    await app.initialize()
    tasks = app.tasks
  })

  afterEach(async () => {
    await app?.terminate()
  })

  it('should be a tasks', () => {
    expect(tasks).toBeDefined()
    expect(tasks).toBeInstanceOf(Tasks)
  })

  it('should execute a task', async () => {
    const task = testTask().withHandler(() => 'value')
    app.registry.tasks.set(task.name, { module: task })
    const execution = tasks.execute(app.container, 'test')
    expect(execution).toHaveProperty('abort', expect.any(Function))
    const result = await execution
    expect(result).toHaveProperty('result', 'value')
  })

  it('should inject context', async () => {
    const task = testTask().withHandler((ctx) => ctx)
    app.registry.tasks.set(task.name, { module: task })
    const { result } = await tasks.execute(app.container, 'test')
    expect(result).toHaveProperty('context')
    expect(result.context).toHaveProperty('logger')
    expect(result.context).toHaveProperty('execute', expect.any(Function))
    expect(result.context).toHaveProperty('signal', expect.any(AbortSignal))
  })

  it('should handle errors', async () => {
    const thrownError = new Error('Test')
    const task = testTask().withHandler(() => {
      throw thrownError
    })

    app.registry.tasks.set(task.name, { module: task })
    const { error } = await tasks.execute(app.container, 'test')
    expect(error).toBe(thrownError)
  })

  it('should inject args', async () => {
    const args = ['arg1', 'arg2']
    const task = testTask().withHandler((ctx, ...args) => args)
    app.registry.tasks.set(task.name, { module: task })
    const { result } = await tasks.execute(app.container, 'test', ...args)
    expect(result).deep.equal(args)
  })

  it('should handle abortion', async () => {
    const future = createFuture<void>()
    const spy = vi.fn(future.resolve)
    const task = testTask().withHandler(
      ({ context }) => new Promise(() => onAbort(context.signal, spy)),
    )

    app.registry.tasks.set(task.name, { module: task })
    const execution = tasks.execute(app.container, 'test')
    defer(() => execution.abort(), 1)
    const { error } = await execution
    expect(error).toBeInstanceOf(Error)
    expect(spy).toHaveBeenCalledOnce()
  })

  it('should handle termination', async () => {
    const future = createFuture<void>()
    const spy = vi.fn(future.resolve)
    const task = testTask().withHandler(
      ({ context }) => new Promise(() => onAbort(context.signal, spy)),
    )

    app.registry.tasks.set(task.name, { module: task })
    const execution = tasks.execute(app.container, 'test')
    defer(() => app.terminate(), 1)
    const { error } = await execution
    expect(error).toBeInstanceOf(Error)
    expect(spy).toHaveBeenCalledOnce()
  })

  it('should execute with custom runner', async () => {
    const runnerFn = vi.fn()
    const taskRunner = testTaskRunner(runnerFn)
    const task = testTask().withHandler(noop)
    const app = testApp({
      tasks: { timeout: defaultTimeout, runner: taskRunner },
    })
    app.registry.tasks.set(task.name, { module: task })
    await app.tasks.execute(app.container, 'test')
    expect(runnerFn).toHaveBeenCalledOnce()
  })

  it('should run command', async () => {
    const task = testTask()
      .withArgs<[number, number]>()
      .withParser((args, kwargs) => {
        return [parseInt(args[0]), kwargs.value]
      })
      .withHandler((ctx, ...args) => args)

    app.registry.tasks.set(task.name, { module: task })
    const { result } = await app.tasks.command(app.container, {
      args: [task.name, 1],
      kwargs: { value: 2 },
    })
    expect(result).toEqual([1, 2])
  })
})
