import { createLogger } from '../lib/logger'
import { BaseAdapter } from './adapter'
import { Api } from './api'
import { Container } from './container'
import { BaseExtension } from './extension'
import {
  ApplicationOptions,
  Command,
  Dependencies,
  ErrorClass,
  Extra,
  Hook,
  ProcedureDeclaration,
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
  container: Container<
    ProcedureDeclaration<Dependencies, Options, Context, any, any>,
    Context
  >
  hooks: Map<string, Set<Function>>
  commands: Map<keyof Extensions, Map<string, Function>>
  context: Context = {} as Context
  errorHandlers: Map<ErrorClass, (error: Error) => Error>

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
      this.hooks.get(Hook.Middleware),
      this.errorHandlers
    )
    this.container = new Container({
      context: this.context,
      logger: this.logger,
      loader: this.api,
    })

    this.initExtensions()
  }

  async start() {
    await this.api.load()
    await this.fireHook(Hook.Start)
    this.initContext()
    await this.container.load()
    await this.adapter.start()
  }

  async stop() {
    await this.adapter.stop()
    await this.fireHook(Hook.Stop)
    await this.container.dispose()
  }

  registerHook(hookName: string, callback: Function) {
    let hooks = this.hooks.get(hookName)
    if (!hooks) this.hooks.set(hookName, (hooks = new Set()))
    hooks.add(callback)
  }

  registerCommand(name: string, command: string, callback: Command) {
    this.commands.get(name).set(command, callback)
  }

  registerErrorHandler<T extends ErrorClass>(
    errorClass: T,
    handler: (error: InstanceType<T>) => Error
  ) {
    this.errorHandlers.set(errorClass, handler)
  }

  private async fireHook(hook: string) {
    const hooks = this.hooks.get(hook)
    if (!hooks) return
    for (const hook of hooks) await hook()
  }

  private init() {
    this.errorHandlers = new Map()
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
      const registerHook = this.registerHook.bind(this)
      const registerErrorHandler = this.registerErrorHandler.bind(this)
      const registerCommand = this.registerCommand.bind(this, name)
      const logger = this.logger.child({ $group: extension.name })
      extension.install({
        logger,
        api,
        container,
        registerCommand,
        registerHook,
        registerErrorHandler,
      })
    }
  }
}
