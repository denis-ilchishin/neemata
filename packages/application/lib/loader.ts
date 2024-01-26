import type { Procedure } from './api'
import { Provider, getProviderScope, type Depender } from './container'
import type { Event } from './events'
import type { Task } from './tasks'
import {
  AnyEvent,
  AnyProcedure,
  AnyTask,
  Scope,
  type AnyApplication,
} from './types'

export class LoaderError extends Error {}

export type LoaderModuleType = 'procedures' | 'tasks' | 'events'

type LoaderModule<T> = {
  module: T
  path?: string
  exportName?: string
}

const scopeErrorMessage = (name, scope = 'Global') =>
  `${name} must be a ${scope} scope (including all nested dependencies)`

const hasNonInvalidScopeDeps = (providers: Provider[], scope = Scope.Global) =>
  providers.some((guard) => getProviderScope(guard) !== scope)

export interface BaseCustomLoader {
  load(): Promise<{
    procedures: Record<string, Required<LoaderModule<Procedure>>>
    tasks: Record<string, Required<LoaderModule<Task>>>
    events: Record<string, Required<LoaderModule<Event>>>
  }>

  paths(): string[]
}

export class Loader {
  procedures: Record<string, LoaderModule<Procedure>> = {}
  tasks: Record<string, LoaderModule<Task>> = {}
  events: Record<string, LoaderModule<Event>> = {}

  constructor(private readonly application: AnyApplication) {}

  async load() {
    const { loaders } = this.application.options
    for (const loader of loaders) {
      const loaded = await loader.load()
      for (const [type, modules] of Object.entries(loaded)) {
        for (const [name, module] of Object.entries(modules)) {
          this.register(
            type as LoaderModuleType,
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
    this.procedures = {}
    this.tasks = {}
    this.events = {}
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

  dependers(): Depender<any>[] {
    return [
      ...Object.values(this.procedures).map(({ module }) => module),
      ...Object.values(this.tasks).map(({ module }) => module),
    ]
  }

  register(
    type: LoaderModuleType,
    name: string,
    module: AnyProcedure | AnyTask | AnyEvent,
    path?: string,
    exportName?: string,
  ) {
    module.name = name

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

    this.application.logger.debug(
      'Registering %s [%s]',
      type.slice(0, -1),
      name,
    )
  }

  private registerProcedure(
    name: string,
    procedure: Procedure,
    path?: string,
    exportName?: string,
  ) {
    if (typeof procedure.handler === 'undefined')
      throw new Error('Procedure handler is not defined')

    if (name in this.procedures)
      throw new Error(`Procedure ${name} already registered`)

    if (hasNonInvalidScopeDeps(procedure.guards))
      throw new Error(scopeErrorMessage('Guards'))

    if (hasNonInvalidScopeDeps(procedure.middlewares))
      throw new Error(scopeErrorMessage('Middlewares'))

    this.procedures[name] = { module: procedure, path, exportName }
  }

  private registerTask(
    name: string,
    task: Task,
    path?: string,
    exportName?: string,
  ) {
    if (typeof task.handler === 'undefined')
      throw new Error('Task handler is not defined')

    if (name in this.tasks) throw new Error(`Task ${name} already registered`)

    if (hasNonInvalidScopeDeps(Object.values(task.dependencies)))
      throw new Error(scopeErrorMessage('Task dependencies'))

    this.tasks[name] = { module: task, path, exportName }
  }

  private registerEvent(
    name: string,
    event: Event,
    path?: string,
    exportName?: string,
  ) {
    if (name in this.events) throw new Error(`Event ${name} already registered`)
    this.events[name] = { module: event, path, exportName }
  }

  private findModule(type: LoaderModuleType, name: string) {
    const found = this[type][name]
    if (found) return found.module
  }
}
