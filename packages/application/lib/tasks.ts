import { ApplicationOptions } from './application'
import {
  Container,
  Dependencies,
  DependencyContext,
  Depender,
} from './container'
import { Loader } from './loader'
import { AnyApplication, Extra, Hook } from './types'
import { defer } from './utils/functions'

export type TaskInterface<Res = any> = {
  result: Promise<Res>
  abort: (reason?: any) => void
}

export type TasksRunner = (
  signal: AbortSignal,
  name: string,
  ...args: any[]
) => Promise<any>

type Handler<
  Context extends Extra,
  Deps extends Dependencies,
  Args extends any[]
> = (ctx: DependencyContext<Context, Deps>, ...args: Args) => any

export class Task<
  TaskContext extends Extra = {},
  TaskDeps extends Dependencies = {},
  TaskArgs extends any[] = any[],
  TaskHandler extends Handler<TaskContext, TaskDeps, TaskArgs> = Handler<
    TaskContext,
    TaskDeps,
    TaskArgs
  >
> implements Depender<TaskDeps>
{
  readonly name!: string
  readonly dependencies!: TaskDeps
  readonly handler!: TaskHandler
  readonly parser!: (
    args: string[],
    kwargs: Record<string, any>
  ) => TaskArgs | Readonly<TaskArgs>

  withArgs<NewArgs extends any[]>() {
    const task = new Task<TaskContext, TaskDeps, NewArgs>()
    return task
  }

  withDependencies<NewDeps extends Dependencies>(dependencies: NewDeps) {
    const task = new Task<TaskContext, NewDeps, TaskArgs>()
    Object.assign(task, this, { dependencies })
    return task
  }

  withHandler<NewHandler extends Handler<TaskContext, TaskDeps, TaskArgs>>(
    handler: NewHandler
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

export class Tasks extends Loader<Task> {
  constructor(
    private readonly application: AnyApplication,
    private readonly options: ApplicationOptions['tasks'] = {}
  ) {
    super(options.path || '')
  }

  protected set(name: string, path: string, task: Task) {
    // @ts-expect-error
    if (!task.name) task.name = name
    this.application.logger.debug('Resolve [%s] task', task.name, path)
    super.set(task.name, path, task)
  }

  registerTask(task: Task) {
    if (!task.name) throw new Error('Task name is required')
    if (this.modules.has(task.name))
      this.application.logger.warn('Task [%s] already registered', task.name)
    this.modules.set(task.name, task)
  }

  execute(
    container: Container,
    name: string,
    ...args: any[]
  ): TaskInterface<any> {
    const ac = new AbortController()
    const abort = (reason?: any) => ac.abort(reason ?? new Error('Aborted'))
    const result = defer(async () => {
      if (!this.modules.has(name)) throw new Error('Task not found')
      if (!this.options!.runner) {
        return new Promise((resolve, reject) => {
          const { dependencies, handler } = this.modules.get(name)!
          const extra = { signal: ac.signal }
          ac.signal.addEventListener('abort', () => reject(ac.signal.reason), {
            once: true,
          })
          defer(async () => {
            ac.signal.throwIfAborted()
            const context = await container.createContext(dependencies, extra)
            return await handler(context, ...args)
          })
            .then(resolve)
            .catch(reject)
        })
      } else {
        return this.options!.runner(ac.signal, name, ...args)
      }
    })

    this.handleTermination(result, abort)
    return { abort, result }
  }

  command(container: Container, { args, kwargs }) {
    const [name, ...taskArgs] = args
    const task = this.modules.get(name)
    if (!task) throw new Error('Task not found')
    const { parser } = task
    const parsedArgs = parser ? parser(taskArgs, kwargs) : []
    return this.execute(container, name, ...parsedArgs)
  }

  private handleTermination(
    result: Promise<any>,
    abort: (reason?: any) => void
  ) {
    const abortExecution = async () => {
      abort()
      await result.finally(unregisterHook)
    }
    const unregisterHook = () => {
      this.application.unregisterHook(Hook.BeforeTerminate, abortExecution)
    }
    this.application.registerHook(Hook.BeforeTerminate, abortExecution)
    result.finally(unregisterHook)
  }
}
