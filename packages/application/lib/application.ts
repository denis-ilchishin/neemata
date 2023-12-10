import { LoggingOptions, createLogger } from '../lib/logger'
import { BaseAdapter } from './adapter'
import { Api, BaseParser } from './api'
import { Container } from './container'
import { BaseExtension } from './extension'
import { TaskDeclaration, Tasks, TasksRunner } from './tasks'
import {
  CallHook,
  Callback,
  Command,
  Commands,
  ErrorClass,
  ExtensionInterface,
  Extra,
  Filter,
  Filters,
  Hook,
  Hooks,
  Middleware,
  Middlewares,
  Pattern,
  ResolveExtensionContext,
  ResolveExtensionOptions,
  UnionToIntersection,
  WorkerType,
} from './types'

export type ApplicationOptions = {
  type: WorkerType
  logging?: LoggingOptions
  api?: {
    parser?: BaseParser
    path?: string
  }
  tasks?: {
    path?: string
    runner?: TasksRunner
  }
}

export type ApplicationWorkerOptions = {
  id: number
  type: WorkerType
  tasksRunner?: TasksRunner
  workerOptions?: any
}

export class Application<
  Adapter extends BaseAdapter = BaseAdapter,
  Extensions extends Record<string, BaseExtension> = {},
  Options extends Extra = UnionToIntersection<
    ResolveExtensionOptions<Extensions[keyof Extensions]>
  > &
    ResolveExtensionOptions<Adapter>,
  Context extends Extra = UnionToIntersection<
    ResolveExtensionContext<Extensions[keyof Extensions]>
  > &
    ResolveExtensionContext<Adapter>
> {
  api: Api<Options, Context>
  tasks: Tasks
  logger: import('pino').Logger
  container: Container
  context: Context = {} as Context

  hooks: Hooks
  commands: Commands
  filters: Filters
  middlewares: Middlewares

  constructor(
    readonly adapter: Adapter,
    readonly options: ApplicationOptions,
    readonly extensions: Extensions = {} as Extensions
  ) {
    this.logger = createLogger(
      this.options.logging,
      `${this.options.type}Worker`
    )

    this.middlewares = new Map()
    this.filters = new Map()
    this.hooks = new Map()
    this.commands = new Map()

    for (const hook of Object.values(Hook)) {
      this.hooks.set(hook, new Set())
    }

    this.commands.set(undefined, new Map())
    for (const extension in this.extensions) {
      this.commands.set(extension, new Map())
    }

    this.api = new Api(this, this.options.api)
    this.tasks = new Tasks(this, this.options.tasks)

    this.container = new Container(
      this,
      this.isApiWorker ? [this.api, this.tasks] : [this.tasks]
    )

    this.initExtensions()
    this.initCommandsAndHooks()
  }

  async initialize() {
    await this.callHook(Hook.BeforeInitialize)
    await this.tasks.load()
    if (this.isApiWorker) await this.api.load()
    await this.container.load()
    await this.callHook(Hook.AfterInitialize)
    this.initContext()
  }

  async start() {
    await this.initialize()
    await this.callHook(Hook.BeforeStart)
    if (this.isApiWorker) await this.adapter.start()
    await this.callHook(Hook.AfterStart)
  }

  async stop() {
    await this.callHook(Hook.BeforeStop)
    if (this.isApiWorker) await this.adapter.stop()
    await this.callHook(Hook.AfterStop)
    await this.terminate()
  }

  async terminate() {
    await this.callHook(Hook.BeforeTerminate)
    await this.container.dispose()
    if (this.isApiWorker) this.api.clear()
    this.tasks.clear()
    await this.callHook(Hook.AfterTerminate)
  }

  execute(declaration: TaskDeclaration<any, any, any[], any>, ...args: any[]) {
    return this.tasks.execute(this.container, declaration.task.name, ...args)
  }

  // TODO: probably it make sense at this point just make Application to extend from EventEmitter ??
  registerHook<T extends string>(hookName: T, hook: (...args: any[]) => any) {
    let hooks = this.hooks.get(hookName)
    if (!hooks) this.hooks.set(hookName, (hooks = new Set()))
    hooks.add(hook)
  }

  unregisterHook<T extends string>(hookName: T, hook: Callback) {
    this.hooks.get(hookName)?.delete(hook)
  }

  registerCommand(name: string, command: string, callback: Command) {
    this.commands.get(name).set(command, callback)
  }

  registerFilter<T extends ErrorClass>(errorClass: T, filter: Filter<T>) {
    this.filters.set(errorClass, filter)
  }

  registerMiddleware(pattern: Pattern, middleware: Middleware) {
    let middlewares = this.middlewares.get(pattern)
    if (!middlewares) this.middlewares.set(pattern, (middlewares = new Set()))
    middlewares.add(middleware)
  }

  private async callHook(hook: Hook, ...args: any[]) {
    const hooks = this.hooks.get(hook)
    if (!hooks) return
    for (const hook of hooks) await hook(...args)
  }

  private initContext() {
    for (const key in this.context) delete this.context[key]
    const mixins = []
    const extensions = [...Object.values(this.extensions), this.adapter]
    for (const extension of extensions) {
      if (extension.context) {
        mixins.push(extension.context())
      }
    }
    Object.assign(this.context, ...mixins, {
      logger: this.logger,
      execute: this.execute.bind(this),
    })
  }

  private initExtensions() {
    const installations = [
      ...Object.entries(this.extensions),
      ['adapter', this.adapter],
    ] as const

    const { api, container } = this
    for (const [name, extension] of installations) {
      if (!extension.install) continue
      const callHook: CallHook<any> = this.callHook.bind(this)
      const registerHook = this.registerHook.bind(this)
      const registerMiddleware = this.registerMiddleware.bind(this)
      const registerFilter = this.registerFilter.bind(this)
      const registerCommand = this.registerCommand.bind(this, name)
      const type = this.options.type
      const logger = this.logger
      ;(extension as ExtensionInterface<any, any>).install({
        type,
        logger,
        api,
        container,
        registerCommand,
        registerHook,
        registerFilter,
        registerMiddleware,
        callHook,
      })
    }
  }

  private initCommandsAndHooks() {
    const taskCommand = this.tasks.command.bind(this.tasks, this.container)
    this.registerCommand(undefined, 'task', taskCommand)
  }

  private get isApiWorker() {
    return this.options.type === WorkerType.Api
  }
}

export const declareApplication = <T extends any>(
  callback: (options: ApplicationWorkerOptions, ...args: any[]) => T
) => callback
