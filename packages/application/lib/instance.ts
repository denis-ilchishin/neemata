import {
  Command,
  Commands,
  ErrorClass,
  Filter,
  Filters,
  Guard,
  Guards,
  Hooks,
  Middleware,
  Middlewares,
} from './types'

export abstract class Instance {
  readonly hooks: Hooks = new Map<string, Set<(...args: any[]) => any>>()
  readonly commands: Commands = new Map<string | symbol, Map<string, Command>>()
  readonly filters: Filters = new Map<ErrorClass, Filter<ErrorClass>>()
  readonly middlewares: Middlewares = new Set<Middleware>()
  readonly guards: Guards = new Set<Guard>()

  initialize?(): any
  terminate?(): any

  registerHook<T extends string>(hookName: T, hook: (...args: any[]) => any) {
    let hooks = this.hooks.get(hookName)
    if (!hooks) this.hooks.set(hookName, (hooks = new Set()))
    hooks.add(hook)
    return this
  }

  registerCommand(name: string | symbol, command: string, callback: Command) {
    this.commands.get(name)?.set(command, callback)
    return this
  }

  registerFilter<T extends ErrorClass>(errorClass: T, filter: Filter<T>) {
    this.filters.set(errorClass, filter)
    return this
  }

  registerMiddleware(middleware: Middleware) {
    this.middlewares.add(middleware)
    return this
  }

  registerGuard(guard: Guard) {
    this.guards.add(guard)
    return this
  }
}
