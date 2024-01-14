import { BaseCustomLoader, Loader } from '..'
import { Api, BaseParser, Procedure } from './api'
import { Container, Provider } from './container'
import { Event, EventManager } from './events'
import { BaseExtension } from './extension'
import { Logger, LoggingOptions, createLogger } from './logger'
import { BaseSubscriptionManager } from './subscription'
import { BaseTaskRunner, Task, Tasks } from './tasks'
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
  loaders: BaseCustomLoader[]
  procedures: {
    timeout: number
    parsers?:
      | BaseParser
      | {
          input?: BaseParser
          output?: BaseParser
        }
  }
  tasks: {
    timeout: number
    runner?: BaseTaskRunner
  }
  events: {
    timeout: number
    parser?: BaseParser
  }
  logging?: LoggingOptions
}

export type ApplicationWorkerOptions = {
  id: number
  type: WorkerType
  tasksRunner?: BaseTaskRunner
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
  AppProcedures extends Record<string, Procedure> = {},
  AppTasks extends Record<string, Task> = {},
  AppEvents extends Record<string, Event> = {}
> {
  readonly _!: {
    transport: AppTransport[keyof AppTransport]
    context: AppContext & {
      eventManager: EventManager<
        Application<
          AppTransport,
          AppExtensions,
          AppProcedureOptions,
          AppContext,
          AppConnectionData,
          AppProcedures,
          AppTasks,
          AppEvents
        >
      >
    }
    options: AppProcedureOptions
    transportData: AppTransport[keyof AppTransport]['_']['transportData']
    connectionData: AppConnectionData
    connection: BaseTransportConnection<
      AppConnectionData,
      AppTransport[keyof AppTransport]['_']['transportData']
    >
    procedures: AppProcedures
    tasks: AppTasks
    events: AppEvents
  }

  readonly transports: { transport: BaseTransport; alias: string }[] = []
  readonly extensions: { extension: BaseExtension; alias: string }[] = []
  readonly api: Api
  readonly tasks: Tasks
  readonly logger: Logger
  readonly loader: Loader
  readonly container: Container
  readonly eventManager: EventManager<this>
  readonly subManager!: BaseSubscriptionManager
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

    this.loader = new Loader(this)
    this.eventManager = new EventManager(this)
    this.api = new Api(this)
    this.tasks = new Tasks(this)
    this.container = new Container(this)

    this.initCommandsAndHooks()
  }

  async initialize() {
    await this.callHook(Hook.BeforeInitialize)
    this.initContext()
    await this.loader.load()
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
    this.loader.clear()
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
      AppProcedures,
      AppTasks,
      AppEvents
    >
  }

  withEvents<T extends Record<string, Event>>(events: T) {
    for (const [name, event] of Object.entries(events)) {
      this.loader.register('events', name, event)
    }
    return this as unknown as Application<
      AppTransport,
      AppExtensions,
      AppProcedureOptions,
      AppContext,
      AppConnectionData,
      AppProcedures,
      AppTasks,
      AppEvents & T
    >
  }

  withProcedures<T extends Record<string, Procedure>>(procedures: T) {
    for (const [name, procedure] of Object.entries(procedures)) {
      this.loader.register('procedures', name, procedure)
    }
    return this as unknown as Application<
      AppTransport,
      AppExtensions,
      AppProcedureOptions,
      AppContext,
      AppConnectionData,
      AppProcedures & T,
      AppTasks,
      AppEvents
    >
  }

  withTasks<T extends Record<string, Task>>(tasks: T) {
    for (const [name, task] of Object.entries(tasks)) {
      this.loader.register('tasks', name, task)
    }
    return this as unknown as Application<
      AppTransport,
      AppExtensions,
      AppProcedureOptions,
      AppContext,
      AppConnectionData,
      AppProcedures & T,
      AppTasks,
      AppEvents
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
      AppProcedures,
      AppTasks,
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
      AppProcedures,
      AppTasks,
      AppEvents
    >
  }

  withSubscriptionManager(subManager: BaseSubscriptionManager) {
    if (this.subManager)
      throw new Error('Subscription manager already registered')
    // @ts-expect-error
    this.subManager = subManager
    this.initExtension(subManager, 'subManager')
    return this
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
    return new Task<this['_']['context']>()
  }

  event() {
    return new Event()
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
      eventManager: this.eventManager,
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
      loader: this.loader,
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
