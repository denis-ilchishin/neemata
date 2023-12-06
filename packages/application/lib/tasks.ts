import { Scope } from '@neemata/common'
import { Container, getProviderScope } from './container'
import { Loader } from './loader'
import { Logger } from './logger'
import {
  ApplicationOptions,
  Dependencies,
  ExtractAppContext,
  TaskDeclaration,
  TaskInterface,
  TaskProvider,
} from './types'
import { defer } from './utils/functions'

export class Tasks extends Loader<
  TaskDeclaration<any, any, any[], TaskProvider>
> {
  constructor(
    private readonly options: ApplicationOptions['tasks'] = {},
    private readonly logger: Logger
  ) {
    super(options.path || '')
  }

  protected set(
    name: string,
    path: string,
    declaration: TaskDeclaration<any, any, any[], any>
  ) {
    if (!declaration.task.name) declaration.task.name = name
    this.logger.info('Resolve [%s] task', declaration.task.name, path)
    super.set(declaration.task.name, path, declaration)
  }

  registerTask(declaration: TaskDeclaration<any, any, any[], any>) {
    this.modules.set(declaration.task.name, declaration)
  }

  execute(
    container: Container,
    name: string,
    ...args: any[]
  ): TaskInterface<any> {
    const ac = new AbortController()
    const abort = (reason) => ac.abort(reason ?? new Error('Aborted'))
    const result = defer(async () => {
      if (!this.modules.has(name)) throw new Error('Task not found')
      if (!this.options.runner) {
        return new Promise((resolve, reject) => {
          const { dependencies, task } = this.modules.get(name)
          const extra = { signal: ac.signal }
          ac.signal.addEventListener('abort', () => reject(ac.signal.reason), {
            once: true,
          })
          defer(async () => {
            ac.signal.throwIfAborted()
            const context = await container.createContext(dependencies, extra)
            return await task.handle(context, ...args)
          })
            .then(resolve)
            .catch(reject)
        })
      } else {
        return this.options.runner(ac.signal, name, ...args)
      }
    })

    return { abort, result }
  }

  command(container: Container, { args, kwargs }) {
    const [name, ...taskArgs] = args
    const task = this.modules.get(name)
    if (!task) throw new Error('Task not found')
    const { parse } = task.task
    const parsedArgs = parse ? parse(taskArgs, kwargs) : []
    return this.execute(container, name, ...parsedArgs)
  }
}

export const declareTask = (
  task: TaskProvider<any, any>,
  dependencies?: Dependencies
): TaskDeclaration<any, any, any[], any> => {
  for (const dep of Object.values(dependencies ?? {})) {
    const scope = getProviderScope(dep)
    if (scope !== Scope.Global)
      throw new Error('Task cannot depend on non-global providers')
  }
  return {
    task,
    dependencies,
  }
}

export const createTypedDeclareTask =
  <App, Context extends ExtractAppContext<App> = ExtractAppContext<App>>() =>
  <Deps extends Dependencies, Args extends any[], Response>(
    task: TaskProvider<Context, Deps, Args, Response>,
    dependencies?: Deps
  ): TaskDeclaration<Context, Deps, Args, Response> => {
    // @ts-expect-error
    return declareTask(task, dependencies)
  }
