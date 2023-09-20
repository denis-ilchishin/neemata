import { createApi } from './api.js'
import { createConfig } from './config.js'
import { createContainer } from './container.js'
import { createServer } from './server.js'
export {
  defineApplication,
  defineContext,
  defineProcedure,
  defineProvider,
} from './utils.js'

/** @typedef {Awaited<ReturnType<typeof createApp>>} App */

/**
 * @param {ReturnType<DefineApplication>} userApp
 */
export const createApp = async (userApp) => {
  const config = createConfig(userApp.config)
  const container = createContainer(config, userApp.contexts)
  const api = await createApi(config, userApp)
  const server = createServer(config, api, container)

  const start = async () => {
    console.log('Starting...')
    await container.load()
    await server.start()
    console.log('Started')
  }

  const stop = async () => {
    await server.stop()
  }

  return {
    start,
    stop,
  }
}
