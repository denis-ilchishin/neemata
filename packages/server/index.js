import { createApi } from './lib/api.js'
import { createConfig } from './lib/config.js'
import { createContainer } from './lib/container.js'
import { logger } from './lib/logger.js'
import { createServer } from './lib/server.js'

export { defineContext, defineProcedure, defineProvider } from './lib/utils.js'

/**
 * @param {import('./types/index.js').ApplicationDeclaration} userApp
 */
export const createApp = async (userApp) => {
  logger.level = userApp.config.logging?.level || 'info'

  logger.debug('Creating application...')

  const config = createConfig(userApp.config)
  const api = await createApi(config, userApp)
  const server = createServer(config, api)
  const container = createContainer(config, server, userApp.contexts)
  server.setGlobalContainer(container)

  const start = async () => {
    logger.info('Starting application...')
    await container.load()

    logger.info('Starting server...')
    await server.start()
  }

  const stop = async () => {
    await server.stop()
  }

  return {
    start,
    stop,
  }
}
