import { createLogger } from '../lib/logger'
import { BaseAdapter } from './adapter'
import { Api } from './api'
import { Container } from './container'
import { BaseExtension } from './extension'
import {
  ApplicationOptions,
  Command,
  Commands,
  ErrorClass,
  Extra,
  Filter,
  Filters,
  Hook,
  Hooks,
  HooksInterface,
  Middleware,
  Middlewares,
  Pattern,
  ResolveExtensionContext,
  ResolveExtensionOptions,
  UnionToIntersection,
} from './types'

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
  logger: import('pino').Logger
  container: Container<this['api']>
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
    this.extensions = extensions ?? ({} as Extensions)
    this.logger = createLogger(options.logging?.level || 'info', 'Neemata')

    this.init()

    this.api = new Api(
      this.options.api,
      this.logger.child({ $group: 'Api' }),
      this.middlewares,
      this.filters
    )

    this.container = new Container({
      context: this.context,
      logger: this.logger,
      loader: this.api,
    })

    this.initExtensions()
  }

  async start() {
    await this.fireHook(Hook.BeforeStart)
    await this.api.load()
    await this.container.load()
    this.initContext()
    await this.fireHook(Hook.OnStart)
    await this.adapter.start()
    await this.fireHook(Hook.AfterStart)
  }

  async stop() {
    await this.fireHook(Hook.BeforeStop)
    await this.adapter.stop()
    await this.fireHook(Hook.OnStop)
    await this.container.dispose()
    await this.fireHook(Hook.AfterStop)
  }

  registerHook<T extends string>(
    hookName: T,
    hook: T extends keyof HooksInterface
      ? HooksInterface[T]
      : (...args: any[]) => any
  ) {
    let hooks = this.hooks.get(hookName)
    if (!hooks) this.hooks.set(hookName, (hooks = new Set()))
    hooks.add(hook)
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

  private async fireHook(hook: Hook, ...args: any[]) {
    const hooks = this.hooks.get(hook)
    if (!hooks) return
    for (const hook of hooks) await hook(...args)
  }

  private init() {
    this.middlewares = new Map()
    this.filters = new Map()
    this.hooks = new Map()
    this.commands = new Map()

    for (const hook of Object.values(Hook)) {
      this.hooks.set(hook, new Set())
    }

    for (const extension in this.extensions) {
      this.commands.set(extension, new Map())
    }
  }

  private initContext() {
    const mixins = []
    const extensions = [...Object.values(this.extensions), this.adapter]
    for (const extension of extensions) {
      if (extension.context) {
        mixins.push(extension.context())
      }
    }
    Object.assign(this.context, ...mixins)
  }

  private initExtensions() {
    const installations = [
      [undefined, this.adapter],
      ...Object.entries(this.extensions),
    ] as const

    const { api, container } = this
    for (const [name, extension] of installations) {
      if (!extension.install) continue
      const fireHook = this.fireHook.bind(this)
      const registerHook = this.registerHook.bind(this)
      const registerMiddleware = this.registerMiddleware.bind(this)
      const registerFilter = this.registerFilter.bind(this)
      const registerCommand = this.registerCommand.bind(this, name)
      const logger = this.logger.child({ $group: extension.name })
      extension.install({
        logger,
        api,
        container,
        registerCommand,
        registerHook,
        registerFilter,
        registerMiddleware,
        fireHook,
      })
    }
  }
}
