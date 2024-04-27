import type {
  AnyEvent,
  AnyModule,
  AnyProcedure,
  AnyProvider,
  AnyTask,
  Command,
  Merge,
} from './common'
import type { Container } from './container'
import type { Hooks } from './hooks'
import type { Logger } from './logger'
import { merge } from './utils/functions'

export type ModuleInitializerOptions = {
  container: Container
  hooks: Hooks
  logger: Logger
}

export type ModuleInitializer = (options: ModuleInitializerOptions) => any

export class Module<
  ModuleProcedures extends Record<string, AnyProcedure> = {},
  ModuleTasks extends Record<string, AnyTask> = {},
  ModuleEvents extends Record<string, AnyEvent> = {},
  ModuleImports extends Record<string, AnyModule> = {},
> {
  initializer?: ModuleInitializer
  imports = {} as ModuleImports
  procedures = {} as ModuleProcedures
  tasks = {} as ModuleTasks
  events = {} as ModuleEvents
  commands = {} as Record<string, Command>

  withInitializer(initializer: ModuleInitializer) {
    if (this.initializer) throw new Error('Initializer already set')
    this.initializer = initializer
    return this
  }

  withProcedures<NewProcedures extends Record<string, AnyProcedure>>(
    procedures: NewProcedures,
  ) {
    this.procedures = merge(this.procedures, procedures)
    return this as unknown as Module<
      Merge<ModuleProcedures, NewProcedures>,
      ModuleTasks,
      ModuleEvents,
      ModuleImports
    >
  }

  withTasks<NewTasks extends Record<string, AnyTask>>(tasks: NewTasks) {
    this.tasks = merge(this.tasks, tasks)
    return this as unknown as Module<
      ModuleProcedures,
      Merge<ModuleTasks, NewTasks>,
      ModuleEvents,
      ModuleImports
    >
  }

  withEvents<NewEvents extends Record<string, AnyEvent>>(events: NewEvents) {
    this.events = merge(this.events, events)
    return this as unknown as Module<
      ModuleProcedures,
      ModuleTasks,
      Merge<ModuleEvents, NewEvents>,
      ModuleImports
    >
  }

  withCommand(command: string, callback: Command) {
    if (this.commands[command]) throw new Error('Command already set')
    this.commands[command] = callback
    return this
  }

  withImports<T extends Record<string, AnyModule>>(modules: T) {
    this.imports = merge(this.imports, modules)
    return this as unknown as Module<
      ModuleProcedures,
      ModuleTasks,
      ModuleEvents,
      Merge<ModuleImports, T>
    >
  }
}
