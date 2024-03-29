import type { ApplicationOptions } from './application'
import {
  type Container,
  type Dependencies,
  type DependencyContext,
  type Depender,
  TASK_SIGNAL_PROVIDER,
} from './container'
import type { Registry } from './registry'
import { Hook, type Merge } from './types'
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

type Handler<Deps extends Dependencies, Args extends any[]> = (
  ctx: DependencyContext<Deps>,
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
  TaskDeps extends Dependencies = {},
  TaskArgs extends any[] = any[],
  TaskType = unknown,
> implements Depender<TaskDeps>
{
  name!: string

  _!: {
    type: TaskType
    handler: Handler<TaskDeps, TaskArgs>
  }

  readonly dependencies: TaskDeps = {} as TaskDeps
  readonly handler!: this['_']['handler']
  readonly parser!: (
    args: string[],
    kwargs: Record<string, any>,
  ) => TaskArgs | Readonly<TaskArgs>

  withArgs<NewArgs extends any[]>() {
    const task = new Task<TaskDeps, NewArgs>()
    Object.assign(task, this)
    return task
  }

  withDependencies<NewDeps extends Dependencies>(dependencies: NewDeps) {
    const task = new Task<Merge<TaskDeps, NewDeps>, TaskArgs>()
    Object.assign(task, this, {
      dependencies: merge(this.dependencies, dependencies),
    })
    return task
  }

  withHandler<
    NewHandler extends this['_']['handler'],
    NewType extends Awaited<ReturnType<NewHandler>>,
  >(handler: NewHandler) {
    const task = new Task<TaskDeps, TaskArgs, NewType>()
    Object.assign(task, this, { handler })
    return task
  }

  withParser(parser: this['parser']) {
    const task = new Task<TaskDeps, TaskArgs, TaskType>()
    Object.assign(task, this, { parser })
    return task
  }

  withName(name: string) {
    const task = new Task<TaskDeps, TaskArgs, TaskType>()
    Object.assign(task, this, { name })
    return task
  }
}

export class Tasks {
  constructor(
    private readonly application: { container: Container; registry: Registry },
    private readonly options: ApplicationOptions['tasks'],
  ) {}

  execute(name: string, ...args: any[]): TaskExecution {
    const ac = new AbortController()
    const abort = (reason?: any) => ac.abort(reason ?? new Error('Aborted'))
    const future = createFuture()
    const task = this.application.registry.task(name)

    onAbort(ac.signal, future.reject)

    defer(async () => {
      if (!task) throw new Error('Task not found')

      ac.signal.throwIfAborted()

      if (this.options.runner)
        return await this.options.runner.execute(ac.signal, name, ...args)

      const { dependencies, handler } = task
      const container = this.application.container.createScope(
        this.application.container.scope,
      )
      container.provide(TASK_SIGNAL_PROVIDER, ac.signal)
      const context = await container.createContext(dependencies)
      return await handler(context, ...args)
    }).then(...future.toArgs())

    this.handleTermination(future.promise, abort)

    return Object.assign(
      future.promise
        .then((result) => ({ result }))
        .catch((error = new Error('Task execution')) => ({ error })),
      { abort },
    )
  }

  async command({ args, kwargs }) {
    const [name, ...taskArgs] = args
    const task = this.application.registry.task(name)
    if (!task) throw new Error('Task not found')
    const { parser } = task
    const parsedArgs = parser ? parser(taskArgs, kwargs) : []
    return await this.execute(name, ...parsedArgs)
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
      this.application.registry.hooks
        .get(Hook.BeforeTerminate)
        ?.delete(abortExecution)
    }
    this.application.registry.registerHook(Hook.BeforeTerminate, abortExecution)
    result.finally(unregisterHook).catch(noop)
  }
}
