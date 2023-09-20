/** @typedef {ReturnType<typeof createContainer>} Container */
/** @typedef {(typeof Scope)[keyof typeof Scope]} Scope */

export const Scope = {
  Default: 'default',
  Connection: 'connection',
  Call: 'call',
}

/**
 * @param {import("./config").Config} config
 * @param {Context<any, any, any>[]} preload
 */
export const createContainer = (
  config,
  preload = [],
  scope = Scope.Default,
  params = {},
  parentProviders = new Map(),
  parentContexts = new Map()
) => {
  const providers = new Map(parentProviders)
  const contexts = new Map()

  const injectProvider = async (injectable) => {
    const provider = providers.get(injectable)
    if (provider) return injectable
    const value = await resolveProvider(injectable)
    providers.set(injectable, value)
    return value
  }

  const injectContext = async (injectable) => {
    const context = contexts.get(injectable)
    if (context) return context
    const value = await resolveContext(injectable)
    contexts.set(injectable, value)
    return value
  }

  const dispose = async () => {
    for (const value of contexts.values()) {
      const dispose = value?.dispose
      if (dispose) await dispose(inject, value, params)
    }
    contexts.clear()
    providers.clear()
  }

  const load = async () => {
    for (const context of preload) {
      if (context[scope]) {
        const value = await resolveContext(context)
        contexts.set(context, value)
      }
    }
  }

  const resolveProvider = async (providerFactory) => {
    const exports = await providerFactory(inject)
    return exports
  }

  const resolveContext = async (context) => {
    const value = parentContexts.get(context)
    const factory = context[scope]
    if (!factory) return undefined
    const exports = await factory(inject, value, params)
    return exports
  }

  const inject = {
    provider: injectProvider,
    context: injectContext,
  }

  const copy = (scope, params) =>
    createContainer(config, [], scope, params, providers, contexts)

  return { copy, load, dispose, inject, params }
}
