import { Api, type BaseParser, type Procedure } from './api'
import {
  CALL_PROVIDER,
  CONNECTION_PROVIDER,
  Container,
  EVENT_MANAGER_PROVIDER,
  EXECUTE_PROVIDER,
  LOGGER_PROVIDER,
  type Provider,
} from './container'
import { type Event, EventManager } from './events'
import { BaseExtension } from './extension'
import { type Logger, type LoggingOptions, createLogger } from './logger'
import {
  APP_COMMAND,
  type BaseCustomLoader,
  Registry,
  type RegistryOptions,
} from './registry'
import {
  type BaseSubscriptionManager,
  BasicSubscriptionManager,
} from './subscription'
import {
  type BaseTaskRunner,
  type Task,
  type TaskExecution,
  Tasks,
} from './tasks'
import { BaseTransport } from './transport'
import { Hook, type Merge, type OmitFirstItem, WorkerType } from './types'

export type ApplicationOptions = {
  type: WorkerType
  loaders: BaseCustomLoader[]
  api: {
    timeout: number
    transports: 'any' | 'specified'
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

export class Application<
  AppTransports extends BaseTransport[] = [],
  // AppExtensions extends BaseExtension = {},
  AppProcedures extends Record<string, Procedure> = {},
  AppTasks extends Record<string, Task> = {},
  AppEvents extends Record<string, Event> = {},
> {
  readonly _!: {
    transports: AppTransports
    connection: AppTransports[number]['_']['connection']
    procedures: AppProcedures
    tasks: AppTasks
    events: AppEvents
  }

  readonly transports = new Set<BaseTransport>()
  readonly extensions = new Set<BaseExtension>()
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
    connection: CONNECTION_PROVIDER as Provider<
      AppTransports[number]['_']['connection']
    >,
    logger: LOGGER_PROVIDER,
    call: CALL_PROVIDER,
    execute: EXECUTE_PROVIDER,
    eventManager: EVENT_MANAGER_PROVIDER,
  }

  constructor(readonly options: ApplicationOptions) {
    this.logger = createLogger(
      this.options.logging,
      `${this.options.type}Worker`,
    )

    this.registry = new Registry(this, this.options.loaders)
    this.container = new Container(this)
    this.eventManager = new EventManager(this)
    this.api = new Api(this, this.options.api)
    this.tasks = new Tasks(this, this.options.tasks)

    this.initializeEssential()
    this.registerSubscriptionManager(new BasicSubscriptionManager())
  }

  async initialize() {
    this.container.provide(this.providers.logger, this.logger)
    this.container.provide(this.providers.eventManager, this.eventManager)
    this.container.provide(this.providers.execute, this.execute.bind(this))

    await this.callHook(Hook.BeforeInitialize)
    await this.registry.load()
    await this.container.load()
    await this.callHook(Hook.AfterInitialize)
  }

  async start() {
    await this.initialize()
    await this.callHook(Hook.BeforeStart)
    if (this.isApiWorker) {
      for (const transport of this.transports) {
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
      for (const transport of this.transports) {
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
      AppProcedures,
      Merge<AppTasks, T>,
      AppEvents
    >
  }

  registerTransport<
    T extends
      | BaseTransport
      | { transport: BaseTransport; options: RegistryOptions },
  >(entry: T) {
    const transport = entry instanceof BaseTransport ? entry : entry.transport
    const options = entry instanceof BaseTransport ? undefined : entry.options
    if (this.transports.has(transport))
      throw new Error('Transport already registered')
    this.transports.add(transport)
    this.initializeExtension(transport, options)

    return this as unknown as Application<
      [
        ...AppTransports,
        T extends { transport: BaseTransport } ? T['transport'] : T,
      ],
      AppProcedures,
      AppTasks,
      AppEvents
    >
  }

  registerExtension<
    T extends
      | BaseExtension
      | { extension: BaseExtension; options: RegistryOptions },
  >(entry: T) {
    const extension = entry instanceof BaseExtension ? entry : entry.extension
    const options = entry instanceof BaseExtension ? undefined : entry.options
    if (this.extensions.has(extension))
      throw new Error('Extension already registered')
    this.extensions.add(extension)
    this.initializeExtension(extension, options)
    return this
  }

  registerSubscriptionManager(
    subManager: BaseSubscriptionManager,
    options?: RegistryOptions,
  ) {
    this.subManager = subManager
    this.initializeExtension(subManager, options)
    return this
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

  private initializeExtension(
    extension: BaseExtension,
    options: RegistryOptions = { namespace: APP_COMMAND as unknown as string },
  ) {
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

  private initializeEssential() {
    const taskCommand = this.tasks.command.bind(this.tasks)
    this.registry.registerCommand(APP_COMMAND, 'task', (arg) =>
      taskCommand(arg),
    )
  }

  private get isApiWorker() {
    return this.options.type === WorkerType.Api
  }
}
