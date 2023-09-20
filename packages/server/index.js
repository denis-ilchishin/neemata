import { createApi } from './lib/api.js'
import { createConfig } from './lib/config.js'
import { createContainer } from './lib/container.js'
import { createServer } from './lib/server.js'

export { defineContext, defineProcedure, defineProvider } from './lib/utils.js'

/** @typedef {Awaited<ReturnType<typeof createApp>>} App */

/**
 * @param {ApplicationDeclaration} userApp
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
