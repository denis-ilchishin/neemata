/** @typedef {ReturnType<typeof createContainer>} Container */

import { Scope } from '@neemata/common'
import { logger } from './logger.js'

/**
 * @param {import("./config").Config} config
 * @param {Record<string, any>} [injectMixin]
 * @param {import("../types").Context<any, any, any>[]} contexts
 */
export const createContainer = (
  config,
  injectMixin = {},
  contexts = [],
  scope = Scope.Default,
  params = {},
  parentProviders = new Map(),
  parentContexts = new Map()
) => {
  const resolvedProviders = new Map(parentProviders)
  const resolvedContexts = new Map()

  const injectProvider = async (injectable) => {
    const provider = resolvedProviders.get(injectable)
    if (provider) return provider
    const value = resolveProvider(injectable)
    resolvedProviders.set(injectable, value)
    return value
  }

  const injectContext = async (injectable) => {
    const context = resolvedContexts.get(injectable)
    if (context) return context
    const value = resolveContext(injectable)
    resolvedContexts.set(injectable, value)
    return value
  }

  const dispose = async () => {
    logger.debug('Disposing [%s] scope context...', scope)
    for (const [context, value] of resolvedContexts) {
      const dispose = context.dispose
      if (context[scope] && dispose) await dispose(inject, value, params)
    }
    resolvedContexts.clear()
    resolvedProviders.clear()
  }

  const load = async () => {
    logger.debug('Preload [%s] scope context...', scope)
    for (const context of contexts) {
      if (context[scope]) {
        const value = await resolveContext(context)
        resolvedContexts.set(context, value)
      }
    }
    return self
  }

  const resolveProvider = (providerFactory) => {
    return providerFactory(inject)
  }

  const resolveContext = async (context) => {
    const value = parentContexts.get(context)
    const factory = context[scope]
    if (!factory) return value
    const exports = await factory(inject, await value, params)
    return exports
  }

  const inject = {
    provider: injectProvider,
    context: injectContext,
    ...injectMixin,
  }

  const copy = (scope, params) =>
    createContainer(
      config,
      injectMixin,
      contexts,
      scope,
      params,
      resolvedProviders,
      new Map([...parentContexts, ...resolvedContexts])
    )

  const self = { copy, load, dispose, inject, params }
  return self
}
