import type { Filter, Guard, Middleware, Procedure } from './api'
import { type Depender, type Provider, getProviderScope } from './container'
import type { Event } from './events'
import type { Logger } from './logger'
import type { Task } from './tasks'
import {
  type AnyEvent,
  type AnyProcedure,
  type AnyTask,
  type Command,
  type ErrorClass,
  Scope,
} from './types'

export const APP_COMMAND = Symbol('appCommand')

export class RegistryError extends Error {}

export interface BaseCustomLoader {
  load(): Promise<{
    procedures: Record<string, Required<RegistryModule<Procedure>>>
    tasks: Record<string, Required<RegistryModule<Task>>>
    events: Record<string, Required<RegistryModule<Event>>>
  }>

  paths(): string[]
}

export type RegistryOptions = {
  namespace: string
  prefix?: string
}

// TODO: too much code duplication here, need to refactor
export class Registry {
  constructor(
    readonly application: { logger: Logger },
    readonly loaders: BaseCustomLoader[],
    readonly procedures = new Map<string, RegistryModule<AnyProcedure>>(),
    readonly tasks = new Map<string, RegistryModule<AnyTask>>(),
    readonly events = new Map<string, RegistryModule<AnyEvent>>(),
    readonly hooks = new Map<string, Set<(...args: any[]) => any>>(),
    readonly commands = new Map<string | symbol, Map<string, Command>>(),
    readonly filters = new Map<ErrorClass, Filter<ErrorClass>>(),
    readonly middlewares = new Set<Middleware>(),
    readonly guards = new Set<Guard>(),
    readonly options?: RegistryOptions,
  ) {}

  async load() {
    for (const loader of this.loaders) {
      const loaded = await loader.load()
      for (const [type, modules] of Object.entries(loaded)) {
        for (const [name, module] of Object.entries(modules)) {
          try {
            this.registerModule(
              type as RegistryModuleType,
              name,
              module.module,
              module.path,
              module.exportName,
            )
          } catch (cause) {
            const errorMsg = `Error registring (${type}) [${name}] in ${module.path}`
            this.application.logger.error(new Error(errorMsg, { cause }))
          }
        }
      }
    }
  }

  clear() {
    this.procedures.clear()
    this.tasks.clear()
    this.events.clear()
  }

  procedure(name: string) {
    return this.findModule('procedures', name) as Procedure | undefined
  }

  task(name: string) {
    return this.findModule('tasks', name) as Task | undefined
  }

  event(name: string) {
    return this.findModule('events', name) as Event | undefined
  }

  globals(): Depender<any>[] {
    return [
      ...this.filters.values(),
      ...Array.from(this.tasks.values()).map(({ module }) => module),
      ...Array.from(this.procedures.values()).map(({ module }) => module),
    ]
  }

  registerProcedure(
    name: string,
    procedure: AnyProcedure,
    path?: string,
    exportName?: string,
  ) {
    name = this.options?.prefix ? `${this.options?.prefix}/${name}` : name

    if (typeof procedure.handler !== 'function')
      throw new Error('Procedure handler is not defined or is not a function')

    if (this.procedures.has(name))
      throw new Error(`Procedure ${name} already registered`)

    procedure.name = name
    this.procedures.set(name, { module: procedure, path, exportName })
    this.application.logger.debug('Registering procedure [%s]', name)
  }

  registerTask(
    name: string,
    task: AnyTask,
    path?: string,
    exportName?: string,
  ) {
    name = this.options?.prefix ? `${this.options?.prefix}/${name}` : name

    if (typeof task.handler !== 'function')
      throw new Error('Task handler is not defined or is not a function')

    if (this.tasks.has(name)) throw new Error(`Task ${name} already registered`)

    if (hasNonInvalidScopeDeps(Object.values(task.dependencies)))
      throw new Error(scopeErrorMessage('Task dependencies'))

    task.name = name
    this.tasks.set(name, { module: task, path, exportName })
    this.application.logger.debug('Registering task [%s]', name)
  }

  registerEvent(
    name: string,
    event: AnyEvent,
    path?: string,
    exportName?: string,
  ) {
    name = this.options?.prefix ? `${this.options?.prefix}/${name}` : name

    if (this.events.has(name))
      throw new Error(`Event ${name} already registered`)

    event.name = name
    this.events.set(name, { module: event, path, exportName })
    this.application.logger.debug('Registering event [%s]', name)
  }

  registerHook<T extends string>(hookName: T, hook: (...args: any[]) => any) {
    let hooks = this.hooks.get(hookName)
    if (!hooks) this.hooks.set(hookName, (hooks = new Set()))
    hooks.add(hook)
  }

  registerCommand(
    namespaceOrCommand: string | symbol,
    commandOrCallback: Command | string,
    callback?: Command,
  ) {
    let namespace: string | symbol
    let command: string
    if (this.options?.namespace) {
      callback = commandOrCallback as Command
      namespace = this.options.namespace
      command = namespaceOrCommand as string
    } else {
      if (!callback) throw new Error('Callback is required')
      namespace = namespaceOrCommand
      command = commandOrCallback as string
    }
    let commands = this.commands.get(namespace)
    if (!commands) this.commands.set(namespace, (commands = new Map()))
    commands.set(command, callback)
  }

  registerFilter<T extends ErrorClass>(errorClass: T, filter: Filter<T>) {
    if (hasNonInvalidScopeDeps([filter]))
      throw new Error(scopeErrorMessage('Filters'))
    this.filters.set(errorClass, filter)
  }

  registerMiddleware(middleware: Middleware) {
    this.middlewares.add(middleware)
  }

  registerGuard(guard: Guard) {
    this.guards.add(guard)
  }

  copy(options: RegistryOptions) {
    return new Registry(
      this.application,
      this.loaders,
      this.procedures,
      this.tasks,
      this.events,
      this.hooks,
      this.commands,
      this.filters,
      this.middlewares,
      this.guards,
      options,
    )
  }

  private registerModule(
    type: RegistryModuleType,
    name: string,
    module: AnyProcedure | AnyTask | AnyEvent,
    path?: string,
    exportName?: string,
  ) {
    switch (type) {
      case 'procedures':
        this.registerProcedure(name, module as Procedure, path, exportName)
        break
      case 'tasks':
        this.registerTask(name, module as Task, path, exportName)
        break
      case 'events':
        this.registerEvent(name, module as Event, path, exportName)
        break
    }
  }

  private findModule(type: RegistryModuleType, name: string) {
    const found = this[type]?.get(name)
    if (found) return found.module
  }
}

export type RegistryModuleType = 'procedures' | 'tasks' | 'events'

type RegistryModule<T> = {
  module: T
  path?: string
  exportName?: string
}

export const scopeErrorMessage = (name, scope = 'Global') =>
  `${name} must be a ${scope} scope (including all nested dependencies)`

export const hasNonInvalidScopeDeps = (
  providers: Provider[],
  scope = Scope.Global,
) => providers.some((guard) => getProviderScope(guard) !== scope)
