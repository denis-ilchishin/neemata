import type { ApplicationOptions } from './application'
import { type AnyTask, Hook, type Merge, type OmitFirstItem } from './common'
import {
  type Container,
  type Dependencies,
  type DependencyContext,
  type Depender,
  TASK_SIGNAL_PROVIDER,
} from './container'
import type { Registry } from './registry'
import { createFuture, defer, merge, noop, onAbort } from './utils/functions'

export type TaskExecution<Res = any> = Promise<
  { result: Res; error: never } | { result: never; error: any }
> & {
  abort(reason?: any): void
}

export type TasksRunner = (
  signal: AbortSignal,
  name: string,
  ...args: any[]
) => Promise<any>

type Handler<Deps extends Dependencies> = (
  ctx: DependencyContext<Deps>,
  ...args: any[]
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
  TaskHandler extends Handler<TaskDeps> = Handler<TaskDeps>,
  TaskType = unknown,
  TaskArgs extends any[] = [],
> implements Depender<TaskDeps>
{
  _!: {
    type: TaskType
    handler: Handler<TaskDeps>
    args: TaskArgs
  }

  readonly dependencies: TaskDeps = {} as TaskDeps
  readonly handler!: this['_']['handler']
  readonly parser!: (
    args: string[],
    kwargs: Record<string, any>,
  ) => TaskArgs | Readonly<TaskArgs>

  withDependencies<NewDeps extends Dependencies>(dependencies: NewDeps) {
    const task = new Task<
      Merge<TaskDeps, NewDeps>,
      Handler<Merge<TaskDeps, NewDeps>>,
      TaskType,
      TaskArgs
    >()
    Object.assign(task, this, {
      dependencies: merge(this.dependencies, dependencies),
    })
    return task
  }

  withHandler<NewHandler extends Handler<TaskDeps>>(handler: NewHandler) {
    const task = new Task<
      TaskDeps,
      TaskHandler,
      Awaited<ReturnType<NewHandler>>,
      OmitFirstItem<Parameters<NewHandler>>
    >()
    Object.assign(task, this, { handler })
    return task
  }

  withParser(parser: this['parser']) {
    const task = new Task<TaskDeps, TaskHandler, TaskType, TaskArgs>()
    Object.assign(task, this, { parser })
    return task
  }
}

export class Tasks {
  constructor(
    private readonly application: { container: Container; registry: Registry },
    private readonly options: ApplicationOptions['tasks'],
  ) {}

  execute(task: AnyTask, ...args: any[]): TaskExecution {
    const ac = new AbortController()
    const abort = (reason?: any) => ac.abort(reason ?? new Error('Aborted'))
    const future = createFuture()

    onAbort(ac.signal, future.reject)

    defer(async () => {
      const taskName = this.application.registry.getName('task', task)

      ac.signal.throwIfAborted()

      if (this.options.runner)
        return await this.options.runner.execute(ac.signal, taskName, ...args)

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
    ) as TaskExecution
  }

  async command({ args, kwargs }) {
    const [name, ...taskArgs] = args
    const task = this.application.registry.getByName('task', name)
    if (!task) throw new Error('Task not found')
    const { parser } = task
    const parsedArgs = parser ? parser(taskArgs, kwargs) : []
    return await this.execute(task, ...parsedArgs)
  }

  private handleTermination(
    result: Promise<any>,
    abort: (reason?: any) => void,
  ) {
    const abortExecution = async () => {
      abort()
      await result.catch(noop)
    }
    const unregisterHook = this.application.registry.hooks.add(
      Hook.BeforeTerminate,
      abortExecution,
    )
    result.finally(unregisterHook).catch(noop)
  }
}
