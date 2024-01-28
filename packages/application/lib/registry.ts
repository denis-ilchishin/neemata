import type { Procedure } from './api'
import { APP_COMMAND } from './application'
import { Provider, getProviderScope, type Depender } from './container'
import type { Event } from './events'
import type { Task } from './tasks'
import {
  AnyEvent,
  AnyProcedure,
  AnyTask,
  Command,
  ConnectionProvider,
  ErrorClass,
  Filter,
  Guard,
  Hook,
  Middleware,
  Scope,
  type AnyApplication,
} from './types'

export class RegistryError extends Error {}

export interface BaseCustomLoader {
  load(): Promise<{
    procedures: Record<string, Required<RegistryModule<Procedure>>>
    tasks: Record<string, Required<RegistryModule<Task>>>
    events: Record<string, Required<RegistryModule<Event>>>
  }>

  paths(): string[]
}

export class Registry {
  procedures = new Map<string, RegistryModule<Procedure>>()
  tasks = new Map<string, RegistryModule<Task>>()
  events = new Map<string, RegistryModule<Event>>()
  hooks = new Map<string, Set<(...args: any[]) => any>>()
  commands = new Map<string | symbol, Map<string, Command>>()
  filters = new Map<ErrorClass, Filter<ErrorClass>>()
  middlewares = new Set<Middleware>()
  guards = new Set<Guard>()

  constructor(readonly application: AnyApplication) {
    for (const hook of Object.values(Hook)) {
      this.hooks.set(hook, new Set())
    }

    this.commands.set(APP_COMMAND, new Map())
  }

  async load() {
    const { loaders } = this.application.options
    for (const loader of loaders) {
      const loaded = await loader.load()
      for (const [type, modules] of Object.entries(loaded)) {
        for (const [name, module] of Object.entries(modules)) {
          this.registerModule(
            type as RegistryModuleType,
            name,
            module.module,
            module.path,
            module.exportName,
          )
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
      ...this.guards,
      ...this.middlewares,
      ...this.filters.values(),
      ...Array.from(this.tasks.values()).map(({ module }) => module),
      ...Array.from(this.procedures.values()).flatMap(({ module }) => [
        module,
        ...module.guards,
        ...module.middlewares,
      ]),
    ]
  }

  registerProcedure(
    name: string,
    procedure: AnyProcedure,
    path?: string,
    exportName?: string,
  ) {
    if (typeof procedure.handler !== 'function')
      throw new Error('Procedure handler is not defined or is not a function')

    if (this.procedures.has(name))
      throw new Error(`Procedure ${name} already registered`)

    if (hasNonInvalidScopeDeps(procedure.guards))
      throw new Error(scopeErrorMessage('Guards'))

    if (hasNonInvalidScopeDeps(procedure.middlewares))
      throw new Error(scopeErrorMessage('Middlewares'))

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

  registerCommand(name: string | symbol, command: string, callback: Command) {
    let commands = this.commands.get(name)
    if (!commands) this.commands.set(name, (commands = new Map()))
    commands.set(command, callback)
  }

  registerFilter<T extends ErrorClass>(errorClass: T, filter: Filter<T>) {
    if (hasNonInvalidScopeDeps([filter]))
      throw new Error(scopeErrorMessage('Filters'))
    this.filters.set(errorClass, filter)
  }

  registerMiddleware(middleware: Middleware) {
    if (hasNonInvalidScopeDeps([middleware]))
      throw new Error(scopeErrorMessage('Middlewares'))
    this.middlewares.add(middleware)
  }

  registerGuard(guard: Guard) {
    if (hasNonInvalidScopeDeps([guard]))
      throw new Error(scopeErrorMessage('Guards'))
    this.guards.add(guard)
  }

  registerConnection(
    connection: ConnectionProvider<
      this['application']['_']['transport']['_']['transportData'],
      this['application']['_']['connectionData']
    >,
  ) {
    this.application.api.connection = connection
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

const scopeErrorMessage = (name, scope = 'Global') =>
  `${name} must be a ${scope} scope (including all nested dependencies)`

const hasNonInvalidScopeDeps = (providers: Provider[], scope = Scope.Global) =>
  providers.some((guard) => getProviderScope(guard) !== scope)
