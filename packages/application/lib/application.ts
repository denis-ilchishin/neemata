import { merge } from '..'
import { Api, BaseParser, Procedure } from './api'
import { Container, Provider } from './container'
import { Event } from './events'
import { BaseExtension } from './extension'
import { Logger, LoggingOptions, createLogger } from './logger'
import { Task, Tasks, TasksRunner } from './tasks'
import { BaseTransport, BaseTransportClient } from './transport'
import {
  CallHook,
  Callback,
  ClientProvider,
  ClientProviderFn,
  Command,
  Commands,
  ErrorClass,
  ExtensionInterface,
  Extra,
  Filter,
  Filters,
  Guard,
  Guards,
  Hook,
  Hooks,
  Middleware,
  Middlewares,
  ResolveExtensionContext,
  ResolveExtensionProcedureOptions,
  UnionToIntersection,
  WorkerType,
} from './types'

export type ApplicationOptions = {
  type: WorkerType
  logging?: LoggingOptions
  api: {
    timeout?: number
    parsers?:
      | BaseParser
      | {
          input?: BaseParser
          output?: BaseParser
        }
    path?: string
  }
  tasks?: {
    timeout?: number
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

export const APP_COMMAND = Symbol('appCommand')

export class Application<
  AppTransport extends BaseTransport = BaseTransport,
  AppExtensions extends Record<string, BaseExtension> = {},
  AppProcedureOptions extends Extra = UnionToIntersection<
    ResolveExtensionProcedureOptions<AppExtensions[keyof AppExtensions]>
  > &
    ResolveExtensionProcedureOptions<AppTransport>,
  AppContext extends Extra = UnionToIntersection<
    ResolveExtensionContext<AppExtensions[keyof AppExtensions]>
  > &
    ResolveExtensionContext<AppTransport>,
  AppClientData = unknown,
  AppEvents extends Record<string, Event> = {}
> {
  readonly _!: {
    transport: AppTransport
    context: AppContext
    options: AppProcedureOptions
    clientData: AppClientData
    client: AppTransport['_']['client'] &
      BaseTransportClient<AppClientData, AppEvents>
    events: AppEvents
  }

  readonly api: Api
  readonly tasks: Tasks
  readonly logger: Logger
  readonly container: Container
  readonly context: AppContext = {} as AppContext

  readonly hooks: Hooks
  readonly commands: Commands
  readonly filters: Filters
  readonly middlewares: Middlewares
  readonly guards: Guards

  constructor(
    readonly options: ApplicationOptions,
    readonly transport: AppTransport,
    readonly extensions: AppExtensions = {} as AppExtensions
  ) {
    this.logger = createLogger(
      this.options.logging,
      `${this.options.type}Worker`
    )

    this.hooks = new Map()
    this.commands = new Map()
    this.filters = new Map()
    this.middlewares = new Set()
    this.guards = new Set()

    for (const hook of Object.values(Hook)) {
      this.hooks.set(hook, new Set())
    }

    this.commands.set(APP_COMMAND, new Map())
    for (const extension in this.extensions) {
      this.commands.set(extension, new Map())
    }

    this.api = new Api(this, this.options.api)
    this.tasks = new Tasks(this, this.options.tasks)

    this.container = new Container(this, [this.api, this.tasks])

    this.initExtensions()
    this.initCommandsAndHooks()
  }

  async initialize() {
    await this.callHook(Hook.BeforeInitialize)
    this.initContext()
    await this.tasks.load()
    await this.api.load()
    await this.container.load()
    await this.callHook(Hook.AfterInitialize)
  }

  async start() {
    await this.initialize()
    await this.callHook(Hook.BeforeStart)
    if (this.isApiWorker) await this.transport.start()
    await this.callHook(Hook.AfterStart)
  }

  async stop() {
    await this.callHook(Hook.BeforeStop)
    if (this.isApiWorker) await this.transport.stop()
    await this.callHook(Hook.AfterStop)
    await this.terminate()
  }

  async terminate() {
    await this.callHook(Hook.BeforeTerminate)
    await this.container.dispose()
    this.api.clear()
    this.tasks.clear()
    await this.callHook(Hook.AfterTerminate)
  }

  execute(task: Task, ...args: any[]) {
    if (!task.name) throw new Error('Task name is required')
    return this.tasks.execute(this.container, task.name, ...args)
  }

  registerHook<T extends string>(hookName: T, hook: (...args: any[]) => any) {
    let hooks = this.hooks.get(hookName)
    if (!hooks) this.hooks.set(hookName, (hooks = new Set()))
    hooks.add(hook)
  }

  registerCommand(name: string | symbol, command: string, callback: Command) {
    this.commands.get(name)?.set(command, callback)
  }

  registerFilter<T extends ErrorClass>(errorClass: T, filter: Filter<T>) {
    this.filters.set(errorClass, filter)
  }

  registerMiddleware(middleware: Middleware) {
    this.middlewares.add(middleware)
  }

  registerGuard(guard: Guard) {
    this.guards.add(guard)
  }

  registerClientProvider(
    provider: ClientProvider<AppTransport['_']['transportData'], AppClientData>
  ) {
    this.api.clientProvider = provider
  }

  unregisterHook<T extends string>(hookName: T, hook: Callback) {
    this.hooks.get(hookName)?.delete(hook)
  }

  withClientData<T>() {
    return this as unknown as Application<
      AppTransport,
      AppExtensions,
      AppProcedureOptions,
      AppContext,
      T,
      AppEvents
    >
  }

  withEvents<T extends Record<string, Event>>(events: T) {
    this.api.events = merge(this.api.events, events)
    return this as unknown as Application<
      AppTransport,
      AppExtensions,
      AppProcedureOptions,
      AppContext,
      AppClientData,
      AppEvents & T
    >
  }

  procedure() {
    return new Procedure<this>()
  }

  provider() {
    return new Provider<any, this>()
  }

  task() {
    return new Task<AppContext>()
  }

  clientProvider() {
    return new Provider<
      ClientProviderFn<
        this['_']['transport']['_']['transportData'],
        AppClientData
      >,
      this
    >()
  }

  // TODO: some hooks might be better to call concurrently,
  // and some of them should be called in reverse order.
  // Probably, need to completely reconsider the hooks system.
  private async callHook(hook: Hook, ...args: any[]) {
    const hooks = this.hooks.get(hook)
    if (!hooks) return
    for (const hook of hooks) await hook(...args)
  }

  private initContext() {
    for (const key in this.context) delete this.context[key]
    const mixins: any[] = []
    const extensions = [...Object.values(this.extensions), this.transport]
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
    const extensions = [
      ...Object.entries(this.extensions),
      ['transport', this.transport],
    ] as const

    const { api, container, logger } = this
    for (const [name, extension] of extensions) {
      const callHook: CallHook<any> = this.callHook.bind(this)
      const registerHook = this.registerHook.bind(this)
      const registerMiddleware = this.registerMiddleware.bind(this)
      const registerFilter = this.registerFilter.bind(this)
      const registerCommand = this.registerCommand.bind(this, name)
      ;(extension as ExtensionInterface<any, any>).application = {
        type: this.options.type,
        logger,
        api,
        container,
        registerCommand,
        registerHook,
        registerFilter,
        registerMiddleware,
        callHook,
      }
      extension.initialize?.()
    }
  }

  private initCommandsAndHooks() {
    const taskCommand = this.tasks.command.bind(this.tasks, this.container)
    this.registerCommand(APP_COMMAND, 'task', (arg) => taskCommand(arg).result)
  }

  private get isApiWorker() {
    return this.options.type === WorkerType.Api
  }
}
