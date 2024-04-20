import type { AnyGuard, AnyMiddleware, Filter, Guard, Middleware } from './api'
import {
  type AnyEvent,
  type AnyModule,
  type AnyProcedure,
  type AnyTask,
  type Command,
  type ErrorClass,
  Scope,
} from './common'
import { type Provider, getProviderScope } from './container'
import { Hooks } from './hooks'
import type { Logger } from './logger'

export const APP_COMMAND = Symbol('APP_COMMAND')

export class Registry {
  readonly procedures = new Map<string, AnyProcedure>()
  readonly tasks = new Map<string, AnyTask>()
  readonly events = new Map<string, AnyEvent>()
  readonly commands = new Map<string | symbol, Map<string, Command>>()
  readonly filters = new Map<ErrorClass, Filter<ErrorClass>>()
  readonly middlewares = new Set<Middleware>()
  readonly guards = new Set<Guard>()
  readonly modules = new Set<AnyModule>()
  readonly hooks = new Hooks()

  protected readonly procedureNames = new Map<AnyProcedure, string>()
  protected readonly taskNames = new Map<AnyTask, string>()
  protected readonly eventNames = new Map<AnyEvent, string>()

  constructor(
    protected readonly application: {
      logger: Logger
      modules: Record<string, AnyModule>
    },
  ) {}

  async load(modules = this.application.modules, prefix?: string) {
    for (const [moduleName, module] of Object.entries(modules)) {
      this.modules.add(module)

      for (const [name, component] of Object.entries(module.procedures))
        this.registerProcedure(
          this.makeComponentName(prefix, moduleName),
          name,
          component as AnyProcedure,
        )

      for (const [name, component] of Object.entries(module.tasks))
        this.registerTask(
          this.makeComponentName(prefix, moduleName),
          name,
          component as AnyTask,
        )

      for (const [name, component] of Object.entries(module.events))
        this.registerEvent(
          this.makeComponentName(prefix, moduleName),
          name,
          component as AnyEvent,
        )

      for (const [name, component] of Object.entries(module.commands))
        this.registerCommand(
          this.makeComponentName(prefix, moduleName),
          name,
          component as Command,
        )

      await this.load(
        module.imports,
        this.makeComponentName(prefix, moduleName),
      )
    }
  }

  getName(
    type: 'event' | 'procedure' | 'task',
    value: AnyEvent | AnyProcedure | AnyTask,
  ) {
    const names = this[`${type}Names`]
    const name = names.get(value as any)
    if (!name) throw new Error(`Registered [${type}] not found`)
    return name
  }

  getByName<T extends 'event' | 'procedure' | 'task'>(
    type: T,
    name: string,
  ): T extends 'event'
    ? AnyEvent
    : T extends 'procedure'
      ? AnyProcedure
      : T extends 'task'
        ? AnyTask
        : never {
    const components = this[`${type}s`] as Map<string, any>
    const value = components.get(name)
    if (!value)
      throw new Error(`Registered [${type}] with name [${name}] not found`)
    return value
  }

  registerProcedure(
    moduleName: string,
    procedureName: string,
    procedure: AnyProcedure,
  ) {
    const name = this.makeComponentName(moduleName, procedureName)

    if (this.procedures.has(name))
      throw new Error(`Procedure ${name} already registered`)

    if (typeof procedure.handler !== 'function')
      throw new Error('Procedure handler is not defined or is not a function')

    if (!procedure.transports.size)
      throw new Error('Procedure must have at least one transport')

    this.application.logger.debug('Registering procedure [%s]', name)

    this.procedures.set(name, procedure)
    this.procedureNames.set(procedure, name)
  }

  registerTask(moduleName: string, taskName: string, task: AnyTask) {
    const name = this.makeComponentName(moduleName, taskName)

    if (this.tasks.has(name)) throw new Error(`Task ${name} already registered`)

    if (typeof task.handler !== 'function')
      throw new Error('Task handler is not defined or is not a function')

    if (hasNonInvalidScopeDeps(Object.values(task.dependencies)))
      throw new Error(scopeErrorMessage('Task dependencies'))

    this.application.logger.debug('Registering task [%s]', name)

    this.tasks.set(name, task)
    this.taskNames.set(task, name)
  }

  registerEvent(moduleName: string, eventName: string, event: AnyEvent) {
    const name = this.makeComponentName(moduleName, eventName)

    if (this.events.has(name))
      throw new Error(`Event ${name} already registered`)

    this.application.logger.debug('Registering event [%s]', name)

    this.events.set(name, event)
    this.eventNames.set(event, name)
  }

  registerHooks<T extends Hooks>(hooks: T) {
    this.hooks.merge(hooks)
  }

  registerCommand(
    moduleName: string | typeof APP_COMMAND,
    commandName: string,
    callback: Command,
  ) {
    let commands = this.commands.get(moduleName)
    if (!commands) this.commands.set(moduleName, (commands = new Map()))
    commands.set(commandName, callback)
  }

  registerFilter<T extends ErrorClass>(errorClass: T, filter: Filter<T>) {
    if (hasNonInvalidScopeDeps([filter]))
      throw new Error(scopeErrorMessage('Filters'))
    this.filters.set(errorClass, filter)
  }

  registerMiddleware(middleware: AnyMiddleware) {
    this.middlewares.add(middleware)
  }

  registerGuard(guard: AnyGuard) {
    this.guards.add(guard)
  }

  clear() {
    this.procedures.clear()
    this.tasks.clear()
    this.events.clear()
    this.hooks.clear()
    this.commands.clear()
    this.filters.clear()
    this.middlewares.clear()
    this.guards.clear()
    this.procedureNames.clear()
    this.taskNames.clear()
    this.eventNames.clear()
  }

  private makeComponentName(...parts: (string | undefined | null)[]) {
    return parts.filter(Boolean).join('/')
  }
}

export const scopeErrorMessage = (name, scope = 'Global') =>
  `${name} must be a ${scope} scope (including all nested dependencies)`

export const hasNonInvalidScopeDeps = (
  providers: Provider[],
  scope = Scope.Global,
) => providers.some((guard) => getProviderScope(guard) !== scope)

export const printRegistry = (registry: Registry) => {
  const mapToTable = (map: Map<string, any>) => Array.from(map.keys())

  console.log('Tasks:')
  console.table(mapToTable(registry.tasks))
  console.log('Procedures:')
  console.table(mapToTable(registry.procedures))
  console.log('Events:')
  console.table(mapToTable(registry.events))
}
