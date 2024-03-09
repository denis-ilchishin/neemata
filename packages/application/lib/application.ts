import { Api, BaseParser, Procedure } from './api'
import {
  Container,
  Provider,
  callProvider,
  connectionProvider,
  eventManagerProvider,
  executeProvider,
  loggerProvider,
} from './container'
import { Event, EventManager } from './events'
import { BaseExtension } from './extension'
import { Logger, LoggingOptions, createLogger } from './logger'
import {
  APP_COMMAND,
  BaseCustomLoader,
  Registry,
  RegistryOptions,
} from './registry'
import { BasicSubscriptionManager } from './sub-managers/basic'
import { BaseSubscriptionManager } from './subscription'
import { BaseTaskRunner, Task, TaskExecution, Tasks } from './tasks'
import { BaseTransport } from './transport'
import { Hook, Merge, OmitFirstItem, WorkerType } from './types'

export type ApplicationOptions = {
  type: WorkerType
  loaders: BaseCustomLoader[]
  api: {
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
  AppProcedures extends Record<string, Procedure> = {},
  AppTasks extends Record<string, Task> = {},
  AppEvents extends Record<string, Event> = {},
> {
  readonly _!: {
    transports: AppTransports
    connection: AppTransports[keyof AppTransports]['_']['connection']
    procedures: AppProcedures
    tasks: AppTasks
    events: AppEvents
  }

  readonly transports: AppTransports = {} as AppTransports
  readonly extensions: AppExtensions = {} as AppExtensions
  readonly api: Api
  readonly tasks: Tasks
  readonly logger: Logger
  readonly registry: Registry
  readonly container: Container
  readonly eventManager: EventManager
  subManager!: BaseSubscriptionManager
  readonly connections = new Map<
    this['_']['connection']['id'],
    this['_']['connection']
  >()
  readonly providers = {
    connection: connectionProvider as Provider<
      AppTransports[keyof AppTransports]['_']['connection']
    >,
    logger: loggerProvider,
    call: callProvider,
    execute: executeProvider,
    eventManager: eventManagerProvider,
  }

  constructor(readonly options: ApplicationOptions) {
    this.logger = createLogger(
      this.options.logging,
      `${this.options.type}Worker`,
    )

    this.registry = new Registry(this, this.options.loaders)
    this.eventManager = new EventManager(this)
    this.api = new Api(this, this.options.api)
    this.tasks = new Tasks(this, this.options.tasks)
    this.container = new Container(this)

    this.registerEssential()
    this.registerSubscriptionManager(new BasicSubscriptionManager())
  }

  async initialize() {
    await this.callHook(Hook.BeforeInitialize)
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

  execute<T extends Task>(
    task: T,
    ...args: OmitFirstItem<Parameters<T['handler']>>
  ): TaskExecution<Awaited<ReturnType<T['handler']>>> {
    return this.tasks.execute(task.name, ...args)
  }

  registerEvents<T extends Record<string, Event>>(events: T) {
    for (const [name, event] of Object.entries(events)) {
      this.registry.registerEvent(name, event)
    }
    return this as unknown as Application<
      AppTransports,
      AppExtensions,
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
      AppProcedures,
      Merge<AppTasks, T>,
      AppEvents
    >
  }

  registerTransports<
    R extends Record<
      string,
      BaseTransport | { transport: BaseTransport; options: RegistryOptions }
    >,
    T extends Record<string, BaseTransport> = {
      [K in keyof R]: R[K] extends { transport: BaseTransport }
        ? R[K]['transport']
        : R[K] extends BaseTransport
          ? R[K]
          : never
    },
  >(transports: R) {
    for (const [alias, entry] of Object.entries(transports)) {
      const transport = entry instanceof BaseTransport ? entry : entry.transport
      const options = entry instanceof BaseTransport ? undefined : entry.options
      if (alias in this.transports)
        throw new Error('Transport already registered')

      // @ts-expect-error
      this.transports[alias] = transport
      this.initExtension(transport, options ?? { namespace: alias })
    }

    return this as unknown as Application<
      Merge<AppTransports, T>,
      AppExtensions,
      AppProcedures,
      AppTasks,
      AppEvents
    >
  }

  registerExtensions<
    R extends Record<
      string,
      BaseExtension | { extension: BaseExtension; options: RegistryOptions }
    >,
    T extends Record<string, BaseExtension> = {
      [K in keyof R]: R[K] extends { extension: BaseExtension }
        ? R[K]['extension']
        : R[K] extends BaseExtension
          ? R[K]
          : never
    },
  >(extensions: R) {
    for (const [alias, entry] of Object.entries(extensions)) {
      const extension = entry instanceof BaseExtension ? entry : entry.extension
      const options = entry instanceof BaseExtension ? undefined : entry.options
      if (alias in this.extensions)
        throw new Error('Extension already registered')

      // @ts-expect-error
      this.extensions[alias] = extension
      this.initExtension(extension, options ?? { namespace: alias })
    }
    return this as unknown as Application<
      AppTransports,
      Merge<AppExtensions, T>,
      AppProcedures,
      AppTasks,
      AppEvents
    >
  }

  registerSubscriptionManager(
    subManager: BaseSubscriptionManager,
    options?: RegistryOptions,
  ) {
    this.subManager = subManager
    this.initExtension(subManager, options ?? { namespace: 'subManager' })
    return this
  }

  createProcedure() {
    return new Procedure<this>()
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

  private initExtension(extension: BaseExtension, options: RegistryOptions) {
    const logger = this.logger.child({ $group: extension.name })
    extension.assign({
      type: this.options.type,
      api: this.api,
      connections: this.connections,
      container: this.container,
      registry: this.registry.copy(options),
      logger,
    })
  }

  private registerEssential() {
    this.container.provide(loggerProvider, this.logger)
    this.container.provide(eventManagerProvider, this.eventManager)
    this.container.provide(executeProvider, this.execute.bind(this))

    const taskCommand = this.tasks.command.bind(this.tasks)
    this.registry.registerCommand(APP_COMMAND, 'task', (arg) =>
      taskCommand(arg),
    )
  }

  private get isApiWorker() {
    return this.options.type === WorkerType.Api
  }
}
