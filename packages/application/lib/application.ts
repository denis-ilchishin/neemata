import { Api, BaseParser, Procedure } from './api'
import { Container, Provider } from './container'
import { Event } from './events'
import { BaseExtension } from './extension'
import { Logger, LoggingOptions, createLogger } from './logger'
import { Task, Tasks, TasksRunner } from './tasks'
import { BaseTransport, BaseTransportConnection } from './transport'
import {
  Command,
  Commands,
  ConnectionFn,
  ConnectionProvider,
  ErrorClass,
  Extra,
  Filter,
  Filters,
  Guard,
  GuardFn,
  Guards,
  Hook,
  Hooks,
  Middleware,
  MiddlewareFn,
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
  AppTransport extends Record<string, BaseTransport> = {},
  AppExtensions extends Record<string, BaseExtension> = {},
  AppProcedureOptions extends Extra = UnionToIntersection<
    ResolveExtensionProcedureOptions<AppExtensions[keyof AppExtensions]>
  > &
    ResolveExtensionProcedureOptions<AppTransport>,
  AppContext extends Extra = UnionToIntersection<
    ResolveExtensionContext<AppExtensions[keyof AppExtensions]>
  > &
    ResolveExtensionContext<AppTransport>,
  AppConnectionData = unknown,
  AppEvents extends Record<string, Event> = {}
> {
  readonly _!: {
    transport: AppTransport[keyof AppTransport]
    context: AppContext
    options: AppProcedureOptions
    transportData: AppTransport[keyof AppTransport]['_']['transportData']
    connectionData: AppConnectionData
    connection: BaseTransportConnection<
      AppConnectionData,
      AppTransport[keyof AppTransport]['_']['transportData'],
      AppEvents
    >
    events: AppEvents
  }

  readonly transports: { transport: BaseTransport; alias: string }[] = []
  readonly extensions: { extension: BaseExtension; alias: string }[] = []
  readonly api: Api
  readonly tasks: Tasks
  readonly logger: Logger
  readonly container: Container
  readonly events: Record<string, Event> = {}
  readonly context: AppContext = {} as AppContext
  readonly connections = new Map<
    this['_']['connection']['id'],
    this['_']['connection']
  >()

  readonly hooks: Hooks
  readonly commands: Commands
  readonly filters: Filters
  readonly middlewares: Middlewares
  readonly guards: Guards

  constructor(readonly options: ApplicationOptions) {
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
    this.api = new Api(this, this.options.api)
    this.tasks = new Tasks(this, this.options.tasks)

    this.container = new Container(this, [this.api, this.tasks])

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
    if (this.isApiWorker) {
      for (const { transport } of this.transports) {
        await transport.start()
      }
    }
    await this.callHook(Hook.AfterStart)
  }

  async stop() {
    await this.callHook(Hook.BeforeStop)
    if (this.isApiWorker) {
      for (const { transport } of this.transports) {
        await transport.stop()
      }
    }
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
    return this
  }

  registerCommand(name: string | symbol, command: string, callback: Command) {
    this.commands.get(name)?.set(command, callback)
    return this
  }

  registerFilter<T extends ErrorClass>(errorClass: T, filter: Filter<T>) {
    this.filters.set(errorClass, filter)
    return this
  }

  registerMiddleware(middleware: Middleware) {
    this.middlewares.add(middleware)
    return this
  }

  registerGuard(guard: Guard) {
    this.guards.add(guard)
    return this
  }

  registerConnection(
    connection: ConnectionProvider<
      this['_']['transport']['_']['transportData'],
      AppConnectionData
    >
  ) {
    this.api.connection = connection
    return this
  }

  withConnection<T>() {
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
    Object.assign(this.events, events)
    return this as unknown as Application<
      AppTransport,
      AppExtensions,
      AppProcedureOptions,
      AppContext,
      AppConnectionData,
      AppEvents & T
    >
  }

  withTransport<T extends BaseTransport, Alias extends string>(
    transport: T,
    alias: Alias
  ) {
    const exists = this.transports.some(
      (t) => t.alias === alias || t.transport === transport
    )
    if (exists) throw new Error(`Transport already registered`)
    this.transports.push({ transport, alias })
    this.initExtension(transport, alias)
    return this as unknown as Application<
      AppTransport & { [K in Alias]: T },
      AppExtensions,
      AppProcedureOptions,
      AppContext,
      AppConnectionData,
      AppEvents
    >
  }

  withExtension<T extends BaseExtension, Alias extends string>(
    extension: T,
    alias: Alias
  ) {
    const exists = this.extensions.some(
      (t) => t.alias === alias || t.extension === extension
    )
    if (exists) throw new Error(`Extension already registered`)
    this.extensions.push({ extension, alias })
    this.initExtension(extension, alias)
    return this as unknown as Application<
      AppTransport,
      AppExtensions & { [K in Alias]: T },
      AppProcedureOptions,
      AppContext,
      AppConnectionData,
      AppEvents
    >
  }

  procedure() {
    return new Procedure<this>()
  }

  provider() {
    return new Provider<any, this>()
  }

  guard() {
    return new Provider<GuardFn<this>, this>()
  }

  middleware() {
    return new Provider<MiddlewareFn<this>, this>()
  }

  task() {
    return new Task<AppContext>()
  }

  connection() {
    return new Provider<
      ConnectionFn<this['_']['transportData'], AppConnectionData>,
      this
    >()
  }

  private async callHook(
    hook: Hook | { hook: Hook; concurrent?: boolean; reverse?: boolean },
    ...args: any[]
  ) {
    const { concurrent = false, reverse = false } =
      typeof hook === 'object' ? hook : {}
    hook = typeof hook === 'object' ? hook.hook : hook
    const hooksSet = this.hooks.get(hook)
    if (!hooksSet) return
    let hooks = Array.from(hooksSet)
    if (concurrent) {
      await Promise.all(Array.from(hooks).map((hook) => hook(...args)))
    } else {
      hooks = reverse ? hooks.reverse() : hooks
      for (const hook of hooks) await hook(...args)
    }
  }

  private initContext() {
    for (const key in this.context) delete this.context[key]
    const mixins: any[] = []
    const extensions = [
      ...this.transports.map((t) => t.transport),
      ...this.extensions.map((e) => e.extension),
    ]
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

  private initExtension(extension: BaseExtension, alias: string) {
    this.commands.set(alias, new Map())
    const logger = this.logger.child({ $group: extension.name })
    const registerHook = (...args: any[]) => {
      // @ts-expect-error
      this.registerHook(...args)
    }
    const registerMiddleware = (...args: any[]) => {
      // @ts-expect-error
      this.registerMiddleware(...args)
    }
    const registerFilter = (...args: any[]) => {
      // @ts-expect-error
      this.registerFilter(...args)
    }
    const registerCommand = (...args: any[]) => {
      // @ts-expect-error
      this.registerCommand(alias, ...args)
    }
    extension.assign({
      type: this.options.type,
      api: this.api,
      connections: this.connections,
      container: this.container,
      logger,
      registerHook,
      registerMiddleware,
      registerFilter,
      registerCommand,
    })
  }

  private initCommandsAndHooks() {
    const taskCommand = this.tasks.command.bind(this.tasks, this.container)
    this.registerCommand(APP_COMMAND, 'task', (arg) => taskCommand(arg).result)
  }

  private get isApiWorker() {
    return this.options.type === WorkerType.Api
  }
}
