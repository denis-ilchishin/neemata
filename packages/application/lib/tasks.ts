import { Scope } from '@neemata/common'
import { Container } from './container'
import { Loader } from './loader'
import { Logger } from './logger'
import {
  ApplicationOptions,
  Depender,
  Extra,
  ProviderDeclaration,
} from './types'
import { defer } from './utils/functions'

export type TaskContext = {
  signal: AbortSignal
  logger: Logger
}

export type Task = (...args: any[]) => any

export type TaskProvider<Context extends Extra> = (
  context: Context
) => Task | Promise<Task>

export type TaskDependencies = Record<
  string,
  ProviderDeclaration<any, any, TaskDependencies, Scope.Global>
>

export interface TaskDeclaration<
  Deps extends TaskDependencies = TaskDependencies,
  Context extends Extra = Extra
> extends Depender<Deps> {
  provider: TaskProvider<Context>
  name?: string
  parse?: Function
}

export type TaskInterface<Res = any> = {
  result: Promise<Res>
  abort: (reason?: any) => void
}

export type TasksRunner = (task: TaskDeclaration) => Promise<TaskInterface<any>>

export class Tasks extends Loader<TaskDeclaration> {
  private runner?: TasksRunner

  constructor(private readonly options?: ApplicationOptions['tasks']) {
    super(options?.path || '')
  }

  protected set(name: string, path: string, declaration: any) {
    if (!declaration.name) declaration.name = name
    super.set(name, path, declaration)
  }

  execute(
    container: Container,
    name: string,
    ...args: any[]
  ): TaskInterface<any> {
    const ac = new AbortController()
    const abort = (...args: any[]) => ac.abort(...args)

    const result = defer(async () => {
      if (!this.modules.has(name)) throw new Error('Task not found')
      if (!this.options.runner) {
        const { dependencies, provider } = this.modules.get(name)
        const extra = { signal: ac.signal }
        const context = await container.createContext(dependencies, extra)
        const task = await provider(context)
        return task(...args)
      } else {
        return this.options.runner(ac.signal, name, ...args)
      }
    })

    return { abort, result }
  }
}
