import { Api, BaseParser, Procedure } from './api'
import { Container, Provider } from './container'
import { Event, EventManager } from './events'
import { BaseExtension } from './extension'
import { Logger, LoggingOptions, createLogger } from './logger'
import { APP_COMMAND, BaseCustomLoader, Registry } from './registry'
import { BasicSubscriptionManager } from './sub-managers/basic'
import { BaseSubscriptionManager } from './subscription'
import { BaseTaskRunner, Task, Tasks } from './tasks'
import { BaseTransport, BaseTransportConnection } from './transport'
import {
  ConnectionFn,
  Extra,
  GuardFn,
  Hook,
  Merge,
  MiddlewareFn,
  ResolveExtensionContext,
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

export class Application<
  AppTransports extends Record<string, BaseTransport> = {},
  AppExtensions extends Record<string, BaseExtension> = {},
  AppContext extends Extra = ResolveExtensionContext<AppExtensions> &
    ResolveExtensionContext<AppTransports>,
  AppConnectionData = unknown,
  AppProcedures extends Record<string, Procedure> = {},
  AppTasks extends Record<string, Task> = {},
  AppEvents extends Record<string, Event> = {},
> {
  readonly _!: {
    transport: AppTransports[keyof AppTransports]
    context: AppContext & {
      eventManager: EventManager<
        BaseTransportConnection<
          AppConnectionData,
          AppTransports[keyof AppTransports]['_']['transportData']
        >
      >
    }
    transportData: AppTransports[keyof AppTransports]['_']['transportData']
    connectionData: AppConnectionData
    connection: BaseTransportConnection<
      AppConnectionData,
      AppTransports[keyof AppTransports]['_']['transportData']
    >
    procedures: AppProcedures
    tasks: AppTasks
    events: AppEvents
  }

  readonly transports: Record<string, BaseTransport> = {}
  readonly extensions: Record<string, BaseExtension> = {}
  readonly api: Api
  readonly tasks: Tasks
  readonly logger: Logger
  readonly registry: Registry
  readonly container: Container
  readonly eventManager: EventManager
  subManager!: BaseSubscriptionManager
  readonly context: AppContext = {} as AppContext
  readonly connections = new Map<
    this['_']['connection']['id'],
    this['_']['connection']
  >()

  constructor(readonly options: ApplicationOptions) {
    this.logger = createLogger(
      this.options.logging,
      `${this.options.type}Worker`,
    )

    this.registry = new Registry(this)
    this.eventManager = new EventManager(this)
    this.api = new Api(this)
    this.tasks = new Tasks(this)
    this.container = new Container(this)

    this.initCommandsAndHooks()
    this.registerSubscriptionManager(new BasicSubscriptionManager())
  }

  async initialize() {
    await this.callHook(Hook.BeforeInitialize)
    this.initContext()
    await this.registry.load()
    await this.container.load()
    await this.callHook(Hook.AfterInitialize)
  }

  async start() {
    await this.initialize()
    await this.callHook(Hook.BeforeStart)
    if (this.isApiWorker) {
      for (const transport of Object.values(this.transports)) {
        await transport
          .start()
          .catch((cause) =>
            this.logger.error(new Error('Transport start error', { cause })),
          )
      }
    }
    await this.callHook(Hook.AfterStart)
  }

  async stop() {
    await this.callHook(Hook.BeforeStop)
    if (this.isApiWorker) {
      for (const transport of Object.values(this.transports)) {
        await transport
          .stop()
          .catch((cause) =>
            this.logger.error(new Error('Transport stop error', { cause })),
          )
      }
    }
    await this.callHook(Hook.AfterStop)
    await this.terminate()
  }

  async terminate() {
    await this.callHook(Hook.BeforeTerminate)
    await this.container.dispose()
    this.registry.clear()
    await this.callHook(Hook.AfterTerminate)
  }

  execute(task: Task, ...args: any[]) {
    return this.tasks.execute(this.container, task.name, ...args)
  }

  withConnectionData<T>() {
    return this as unknown as Application<
      AppTransports,
      AppExtensions,
      AppContext,
      T,
      AppProcedures,
      AppTasks,
      AppEvents
    >
  }

  registerEvents<T extends Record<string, Event>>(events: T) {
    for (const [name, event] of Object.entries(events)) {
      this.registry.registerEvent(name, event)
    }
    return this as unknown as Application<
      AppTransports,
      AppExtensions,
      AppContext,
      AppConnectionData,
      AppProcedures,
      AppTasks,
      Merge<AppEvents, T>
    >
  }

  registerProcedures<T extends Record<string, Procedure>>(procedures: T) {
    for (const [name, procedure] of Object.entries(procedures)) {
      this.registry.registerProcedure(name, procedure)
    }
    return this as unknown as Application<
      AppTransports,
      AppExtensions,
      AppContext,
      AppConnectionData,
      Merge<AppProcedures, T>,
      AppTasks,
      AppEvents
    >
  }

  registerTasks<T extends Record<string, Task>>(tasks: T) {
    for (const [name, task] of Object.entries(tasks)) {
      this.registry.registerTask(name, task)
    }
    return this as unknown as Application<
      AppTransports,
      AppExtensions,
      AppContext,
      AppConnectionData,
      AppProcedures,
      Merge<AppTasks, T>,
      AppEvents
    >
  }

  registerTransport<T extends Record<string, BaseTransport>>(
    transports: T,
    registryPrefix?: string,
  ) {
    for (const [alias, transport] of Object.entries(transports)) {
      if (alias in this.transports)
        throw new Error('Transport already registered')
      this.transports[alias] = transport
      this.initExtension(transport, registryPrefix)
    }

    return this as unknown as Application<
      Merge<AppTransports, T>,
      AppExtensions,
      AppContext & ResolveExtensionContext<T>,
      AppConnectionData,
      AppProcedures,
      AppTasks,
      AppEvents
    >
  }

  registerExtension<T extends Record<string, BaseExtension>>(
    extensions: T,
    registryPrefix?: string,
  ) {
    for (const [alias, extension] of Object.entries(extensions)) {
      if (alias in this.extensions)
        throw new Error('Extension already registered')
      this.extensions[alias] = extension
      this.initExtension(extension, registryPrefix)
    }
    return this as unknown as Application<
      AppTransports,
      Merge<AppExtensions, T>,
      AppContext & ResolveExtensionContext<T>,
      AppConnectionData,
      AppProcedures,
      AppTasks,
      AppEvents
    >
  }

  registerSubscriptionManager(
    subManager: BaseSubscriptionManager,
    registryPrefix?: string,
  ) {
    this.subManager = subManager
    this.initExtension(subManager, registryPrefix)
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
    hookOrOptions:
      | Hook
      | { hook: Hook; concurrent?: boolean; reverse?: boolean },
    ...args: any[]
  ) {
    const {
      concurrent = false,
      reverse = false,
      hook,
    } = typeof hookOrOptions === 'object'
      ? hookOrOptions
      : { hook: hookOrOptions }
    const hooksSet = this.registry.hooks.get(hook)
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
    const extensions = [
      ...Object.entries(this.extensions),
      ...Object.entries(this.transports),
    ]
    for (const [alias, extension] of extensions) {
      if (extension.context) {
        // @ts-expect-error
        this.context[alias] = extension.context()
      }
    }
    Object.assign(this.context, {
      logger: this.logger,
      execute: this.execute.bind(this),
      eventManager: this.eventManager,
    })
  }

  private initExtension(extension: BaseExtension, registryPrefix?: string) {
    const logger = this.logger.child({ $group: extension.name })
    extension.assign({
      type: this.options.type,
      api: this.api,
      connections: this.connections,
      container: this.container,
      registry: this.registry.copy(registryPrefix),
      logger,
    })
  }

  private initCommandsAndHooks() {
    const taskCommand = this.tasks.command.bind(this.tasks, this.container)
    this.registry.registerCommand(APP_COMMAND, 'task', (arg) =>
      taskCommand(arg),
    )
  }

  private get isApiWorker() {
    return this.options.type === WorkerType.Api
  }
}
