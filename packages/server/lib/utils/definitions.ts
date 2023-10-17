import { Scope } from '@neemata/common'

const markAs = <T>(value: T, mark: symbol): T & { injectableType: symbol } =>
  //@ts-expect-error
  Object.defineProperty(value, 'injectableType', {
    value: mark,
    writable: false,
    configurable: false,
  })

export const PROCEDURE_SYMBOL = Symbol('procedure')
export const PROVIDER_SYMBOL = Symbol('provider')
export const CONTEXT_SYMBOL = Symbol('context')
export const TASK_SYMBOL = Symbol('task')
export const APPLICATION_SYMBOL = Symbol('application')

export const defineProcedure: DefineProcedure = (procedure, dependencies) =>
  markAs({ procedure, dependencies }, PROCEDURE_SYMBOL)

export const defineProvider: DefineProvider = (provider, dependencies) =>
  markAs({ provider, dependencies }, PROVIDER_SYMBOL)

export const defineContext: DefineContext = (context, dependencies) => {
  // @ts-expect-error
  context.scope ??= Scope.Global
  return markAs({ context, dependencies }, CONTEXT_SYMBOL)
}

export const defineTask: DefineTask = (task, nameOrDeps, deps) => {
  const name = typeof nameOrDeps === 'string' ? nameOrDeps : undefined
  const dependencies = typeof nameOrDeps === 'string' ? deps : nameOrDeps
  return markAs({ task, dependencies, name }, TASK_SYMBOL)
}

export const defineApplication: DefineApplication = (value) =>
  markAs(value, APPLICATION_SYMBOL)
