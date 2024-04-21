import { Api, type BaseParser } from './api'
import {
  type AnyModule,
  type ClassConstructor,
  type ExecuteFn,
  type ExtensionApplication,
  Hook,
  type Merge,
  Scope,
  WorkerType,
} from './common'
import {
  Container,
  EVENT_MANAGER_PROVIDER,
  EXECUTE_PROVIDER,
  LOGGER_PROVIDER,
} from './container'
import { EventManager } from './events'
import type { BaseExtension } from './extension'
import { type Logger, type LoggingOptions, createLogger } from './logger'
import { APP_COMMAND, Registry, printRegistry } from './registry'
import {
  type BaseSubscriptionManager,
  BasicSubscriptionManager,
} from './subscription'
import { type BaseTaskRunner, Tasks } from './tasks'
import type { BaseTransport } from './transport'
import { merge } from './utils/functions'

export type ApplicationOptions = {
  type: WorkerType
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

export class Application<
  AppTransports extends BaseTransport[] = [],
  AppModules extends Record<string, AnyModule> = {},
> {
  readonly _!: {
    transports: AppTransports
    connection: AppTransports[number]['_']['connection']
  }

  readonly api: Api
  readonly tasks: Tasks
  readonly logger: Logger
  readonly registry: Registry
  readonly container: Container
  readonly eventManager: EventManager
  subManager!: BaseSubscriptionManager

  readonly modules = {} as AppModules
  readonly transports = new Set<BaseTransport>()
  readonly extensions = new Set<BaseExtension>()
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

    // create unexposed container for internal providers, which never gets disposed
    const container = new Container(this)

    container.provide(LOGGER_PROVIDER, this.logger)
    container.provide(EVENT_MANAGER_PROVIDER, this.eventManager)
    container.provide(EXECUTE_PROVIDER, this.execute.bind(this))

    // create a global container for rest of the application
    // including transports, extensions, etc.
    this.container = container.createScope(Scope.Global)

    this.api = new Api(this, this.options.api)
    this.tasks = new Tasks(this, this.options.tasks)

    this.registerSubscriptionManager(BasicSubscriptionManager)
  }

  async initialize() {
    await this.registry.hooks.call(Hook.BeforeInitialize, { concurrent: false })
    this.initializeEssential()
    await this.registry.load()
    await this.container.load()
    await this.registry.hooks.call(Hook.AfterInitialize, { concurrent: false })
  }

  async start() {
    await this.initialize()
    await this.registry.hooks.call(Hook.BeforeStart, { concurrent: false })
    if (this.isApiWorker) {
      for (const transport of this.transports) {
        await transport
          .start()
          .catch((cause) =>
            this.logger.error(new Error('Transport start error', { cause })),
          )
      }
    }
    await this.registry.hooks.call(Hook.AfterStart, { concurrent: false })
  }

  async stop() {
    await this.registry.hooks.call(Hook.BeforeStop, { concurrent: false })
    if (this.isApiWorker) {
      for (const transport of this.transports) {
        await transport
          .stop()
          .catch((cause) =>
            this.logger.error(new Error('Transport stop error', { cause })),
          )
      }
    }
    await this.registry.hooks.call(Hook.AfterStop, { concurrent: false })
    await this.terminate()
  }

  async terminate() {
    await this.registry.hooks.call(Hook.BeforeTerminate, {
      concurrent: false,
      reverse: true,
    })
    await this.container.dispose()
    this.registry.clear()
    await this.registry.hooks.call(Hook.AfterTerminate, {
      concurrent: false,
      reverse: true,
    })
  }

  execute: ExecuteFn = (task, ...args: any[]) => {
    return this.tasks.execute(task, ...args)
  }

  registerTransport<
    T extends ClassConstructor<BaseTransport>,
    I extends InstanceType<T>,
  >(
    transportClass: T,
    ...args: null extends I['_']['options'] ? [] : [I['_']['options']]
  ) {
    const [options] = args
    const transport = this.initializeExtension(transportClass, options) as I
    this.transports.add(transport)
    return this as unknown as Application<[...AppTransports, I], AppModules>
  }

  registerExtension<
    T extends ClassConstructor<BaseExtension>,
    I extends InstanceType<T>,
  >(
    extenstionClass: T,
    ...args: null extends I['_']['options'] ? [] : [I['_']['options']]
  ) {
    const [options] = args
    const extension = this.initializeExtension(extenstionClass, options) as I
    this.extensions.add(extension)
    return this
  }

  registerSubscriptionManager(
    subManagerClass: ClassConstructor<BaseSubscriptionManager>,
  ) {
    this.subManager = this.initializeExtension(
      subManagerClass,
    ) as BaseSubscriptionManager
    return this
  }

  registerModules<T extends Record<string, AnyModule>>(modules: T) {
    // @ts-expect-error
    this.modules = merge(this.modules, modules)
    return this as unknown as Application<AppTransports, Merge<AppModules, T>>
  }

  private initializeExtension<
    T extends ClassConstructor<BaseExtension>,
    I extends InstanceType<T>,
  >(extensionClass: T, options?: I['_']['options']) {
    const logger = this.logger.child({ $group: extensionClass.name })
    const app: ExtensionApplication = {
      type: this.options.type,
      api: this.api,
      connections: {
        add: (connection) => {
          this.connections.set(connection.id, connection)
          this.registry.hooks.call(
            Hook.OnConnection,
            { concurrent: true },
            connection,
          )
        },
        remove: (connectionOrId) => {
          const connection =
            typeof connectionOrId === 'string'
              ? this.connections.get(connectionOrId)
              : connectionOrId
          if (connection) {
            this.connections.delete(connection.id)
            this.registry.hooks.call(
              Hook.OnDisconnection,
              { concurrent: true },
              connection,
            )
          }
        },
        get: (id) => this.connections.get(id),
      },
      container: this.container,
      registry: this.registry,
      logger,
    }
    const instance = new extensionClass(app, options)
    logger.setBindings({ $group: instance.name })
    return instance
  }

  private initializeEssential() {
    const taskCommand = this.tasks.command.bind(this.tasks)
    this.registry.registerCommand(APP_COMMAND, 'task', (arg) =>
      taskCommand(arg).then(({ error }) => {
        if (error) this.logger.error(error)
      }),
    )

    this.registry.registerCommand(APP_COMMAND, 'registry', () => {
      printRegistry(this.registry)
    })
  }

  private get isApiWorker() {
    return this.options.type === WorkerType.Api
  }
}
