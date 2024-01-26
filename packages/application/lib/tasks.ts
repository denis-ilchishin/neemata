import {
  Container,
  Dependencies,
  DependencyContext,
  Depender,
} from './container'
import { AnyApplication, Extra, Hook, Merge } from './types'
import { createFuture, defer, merge, noop, onAbort } from './utils/functions'

export type TaskExecution<Res = any> = Promise<
  { result: Res; error?: any } | { result?: Res; error: any }
> & {
  abort(reason?: any): void
}

export type TasksRunner = (
  signal: AbortSignal,
  name: string,
  ...args: any[]
) => Promise<any>

type Handler<
  Context extends Extra,
  Deps extends Dependencies,
  Args extends any[],
> = (
  ctx: DependencyContext<Context & { signal: AbortSignal }, Deps>,
  ...args: Args
) => any

export abstract class BaseTaskRunner {
  abstract execute(
    signal: AbortSignal,
    name: string,
    ...args: any[]
  ): Promise<any>
}

export class Task<
  TaskContext extends Extra = {},
  TaskDeps extends Dependencies = {},
  TaskArgs extends any[] = any[],
  TaskHandler extends Handler<TaskContext, TaskDeps, TaskArgs> = Handler<
    TaskContext,
    TaskDeps,
    TaskArgs
  >,
> implements Depender<TaskDeps>
{
  name!: string
  readonly dependencies: TaskDeps = {} as TaskDeps
  readonly handler!: TaskHandler
  readonly parser!: (
    args: string[],
    kwargs: Record<string, any>,
  ) => TaskArgs | Readonly<TaskArgs>

  withArgs<NewArgs extends any[]>() {
    const task = new Task<TaskContext, TaskDeps, NewArgs>()
    Object.assign(task, this)
    return task
  }

  withDependencies<NewDeps extends Dependencies>(dependencies: NewDeps) {
    const task = new Task<TaskContext, Merge<TaskDeps, NewDeps>, TaskArgs>()
    Object.assign(task, this, {
      dependencies: merge(this.dependencies, dependencies),
    })
    return task
  }

  withHandler<NewHandler extends Handler<TaskContext, TaskDeps, TaskArgs>>(
    handler: NewHandler,
  ) {
    const task = new Task<TaskContext, TaskDeps, TaskArgs, NewHandler>()
    Object.assign(task, this, { handler })
    return task
  }

  withParser(parser: this['parser']) {
    const task = new Task<TaskContext, TaskDeps, TaskArgs, TaskHandler>()
    Object.assign(task, this, { parser })
    return task
  }

  withName(name: string) {
    const task = new Task<TaskContext, TaskDeps, TaskArgs, TaskHandler>()
    Object.assign(task, this, { name })
    return task
  }
}

export class Tasks {
  constructor(
    private readonly application: AnyApplication,
    private readonly options = application.options.tasks,
  ) {}

  execute(container: Container, name: string, ...args: any[]): TaskExecution {
    const ac = new AbortController()
    const abort = (reason?: any) => ac.abort(reason ?? new Error('Aborted'))
    const future = createFuture()
    const task = this.application.loader.task(name)
    if (!task) throw new Error('Task not found')

    onAbort(ac.signal, future.reject)

    defer(async () => {
      ac.signal.throwIfAborted()

      if (this.options.runner)
        return await this.options.runner.execute(ac.signal, name, ...args)

      const { dependencies, handler } = task
      const extra = { signal: ac.signal }
      const context = await container.createContext(dependencies, extra)
      return await handler(context, ...args)
    }).then(...future.toArgs())

    this.handleTermination(future.promise, abort)

    return Object.assign(
      future.promise
        .then((result) => ({ result }))
        .catch((error = new Error('Undefined error')) => ({ error })),
      { abort },
    )
  }

  command(container: Container, { args, kwargs }) {
    const [name, ...taskArgs] = args
    const task = this.application.loader.task(name)
    if (!task) throw new Error('Task not found')
    const { parser } = task
    const parsedArgs = parser ? parser(taskArgs, kwargs) : []
    return this.execute(container, name, ...parsedArgs)
  }

  private handleTermination(
    result: Promise<any>,
    abort: (reason?: any) => void,
  ) {
    // TODO: refactor this
    const abortExecution = async () => {
      abort()
      await result.finally(unregisterHook).catch(noop)
    }
    const unregisterHook = () => {
      this.application.hooks.get(Hook.BeforeTerminate)?.delete(abortExecution)
    }
    this.application.registerHook(Hook.BeforeTerminate, abortExecution)
    result.finally(unregisterHook).catch(noop)
  }
}
