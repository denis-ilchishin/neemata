import { createApi } from './lib/api.js'
import { createConfig } from './lib/config.js'
import { createContainer } from './lib/container.js'
import { logger, setLoggerSettings } from './lib/logger.js'
import { createServer } from './lib/server.js'
import { createTasker } from './lib/tasker.js'

export {
  defineApplication,
  defineContext,
  defineProcedure,
  defineProvider,
  defineTask,
} from './lib/utils.js'

/**
 * @param {import('./types/index.js').ApplicationDeclaration} userApp
 */
export const createApp = async (userApp) => {
  setLoggerSettings(userApp.config)
  logger.debug('Creating the application...')

  const config = createConfig(userApp.config)
  const tasker = createTasker(config, userApp)
  const api = await createApi(config, userApp)
  const server = createServer(config, api)
  const injectMixin = {
    logger,
    websockets: server.websockets,
    invoke: tasker.invoke,
  }
  const container = createContainer(config, injectMixin, userApp.contexts)
  server.setGlobalContainer(container)

  const start = async () => {
    logger.info('Starting the application...')

    logger.debug('Loading default contexts...')
    await container.load()

    logger.debug('Spinning up tasker workers...')
    await tasker.start()

    logger.debug('Starting the server...')
    await server.start()
  }

  const stop = async () => {
    await server.stop()
  }

  return {
    start,
    stop,
    tasker,
    container,
  }
}
