import {
  BaseExtension,
  DependencyContext,
  ExtensionInstallOptions,
  Hook,
  Loader,
  OmitFirstItem,
} from '@neemata/application'
import { TaskWorkerPool, type TaskWorkerPoolOptions } from './pool'
import {
  Task,
  TaskContext,
  TaskDeclaration,
  TaskDependencies,
  TaskInterface,
} from './types'
import { TaskWorker } from './worker'

export type RequireProperty<T, K extends keyof T> = T & { [P in K]-?: T[P] }
export type TasksExtensionOptions = {
  pool: TaskWorkerPoolOptions
  path?: string
}

export type InvokeOptions = {
  executionTimeout?: number
  poolTimeout?: number
  capture?: boolean
}

export type TasksExtensionProcedureOptions = {}
export type TasksExtensionContext = {
  isTask: boolean
  invoke: <
    Declaration extends TaskDeclaration<any, any, any>,
    Task extends Declaration extends TaskDeclaration<any, any, infer T>
      ? T
      : never,
    Args extends OmitFirstItem<Parameters<Task>>
  >(
    taskOrOptions: Declaration | (InvokeOptions & { task: Declaration }),
    ...args: Args
  ) => TaskInterface<Awaited<ReturnType<Declaration['task']>>>
}

export class Tasks extends Loader<TaskDeclaration<any, any, any>> {
  constructor(root?: string) {
    super(root)
  }

  protected set(name: string, path: string, declaration: any) {
    if (!declaration.name) declaration.name = name
    super.set(name, path, declaration)
  }
}

export class TasksExtension extends BaseExtension<
  TasksExtensionProcedureOptions,
  TasksExtensionContext
> {
  name = 'TasksExtension'
  tasks: Tasks
  pool: TaskWorkerPool

  constructor(private readonly options?: TasksExtensionOptions) {
    super()
    this.tasks = new Tasks(options?.path)
    this.pool = new TaskWorkerPool(options.pool, this.tasks)
  }

  install({
    registerHook,
    registerCommand,
    logger,
  }: ExtensionInstallOptions<
    TasksExtensionProcedureOptions,
    TasksExtensionContext
  >) {
    registerHook(Hook.OnStart, async () => {
      if (this.options.path) await this.tasks.load()
      await this.pool.start()
    })
    registerHook(Hook.OnStop, () => this.pool.stop())
    registerCommand('run', async ({ args, kwargs }) => {
      const [taskName, ...cliArgs] = args
      const taskWorker = new TaskWorker(this.tasks, {
        logLevel: this.options.pool.logLevel,
      })
      await taskWorker.initialize()
      const declaration = this.tasks.modules.get(taskName)
      if (!declaration) throw new Error('Task not found')
      const { parse } = declaration
      const { signal } = new AbortController()
      const taskArgs = parse ? parse(cliArgs, kwargs) : cliArgs
      try {
        const result = await taskWorker.runTask({
          signal,
          args: taskArgs,
          taskName,
        })
        logger.info('Task successfully executed')
        logger.debug({ result }, 'Result:')
      } catch (cause) {
        logger.error(new Error('Task failed', { cause }))
      } finally {
        await taskWorker.terminate()
      }
    })
  }

  invoke: TasksExtensionContext['invoke'] = (declarationOrOptions, ...args) => {
    const isOptions = typeof declarationOrOptions.task !== 'function'
    const declaration: TaskDeclaration<any, any, any> = isOptions
      ? declarationOrOptions.task
      : declarationOrOptions

    const { task, ...options } = isOptions
      ? declarationOrOptions
      : { task: declaration }

    //@ts-expect-error
    return this.pool.invoke(task.name, options, args)
  }

  context(): TasksExtensionContext {
    return {
      isTask: false,
      invoke: this.invoke.bind(this),
    }
  }

  declareTask<
    Deps extends TaskDependencies,
    T extends Task<DependencyContext<TaskContext, Deps>>
  >(
    task: T,
    dependencies?: Deps,
    name?: string,
    parse?: (
      args: string[],
      kwargs: Record<string, string>
    ) => OmitFirstItem<Parameters<T>>
  ): TaskDeclaration<Deps, DependencyContext<TaskContext, Deps>, T> {
    return { task, dependencies, name, parse }
  }

  registerTask(
    name: string,
    declaration: TaskDeclaration<
      TaskDependencies,
      DependencyContext<TaskContext, TaskDependencies>,
      any
    >
  ) {
    this.tasks.modules.set(name, declaration)
  }
}
