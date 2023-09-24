/** @typedef {ReturnType<typeof createContainer>} Container */

import { Scope } from '@neemata/common'
import { logger } from './logger.js'

/**
 * @param {import("./config").Config} config
 * @param {Record<string, any>} [injectMixin]
 * @param {import("../types").Context<any, any, any>[]} preload
 */
export const createContainer = (
  config,
  injectMixin = {},
  preload = [],
  scope = Scope.Default,
  params = {},
  parentProviders = new Map(),
  parentContexts = new Map()
) => {
  logger.debug('Initialize [%s] scope context...', scope)

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
    logger.debug('Disposing [%s] scope context...', scope)
    for (const value of contexts.values()) {
      const dispose = value?.dispose
      if (dispose) await dispose(inject, value, params)
    }
    contexts.clear()
    providers.clear()
  }

  const load = async () => {
    logger.debug('Preload [%s] scope context...', scope)
    for (const context of preload) {
      if (context[scope]) {
        const value = await resolveContext(context)
        contexts.set(context, value)
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
    if (!factory) return undefined
    const exports = await factory(inject, value, params)
    return exports
  }

  const inject = {
    provider: injectProvider,
    context: injectContext,
    ...injectMixin,
  }

  const copy = (scope, params) =>
    createContainer(config, injectMixin, [], scope, params, providers, contexts)

  const self = { copy, load, dispose, inject, params }
  return self
}
