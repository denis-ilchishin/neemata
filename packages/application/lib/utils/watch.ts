import { register } from 'node:module'
import { pathToFileURL } from 'node:url'
import type { Application } from '../application'
import { debounce } from './functions'

export const watchApp = (registerPath: string, app: Application) => {
  const { port1, port2 } = new MessageChannel()
  const paths = app.options.loaders.flatMap((loader) => loader.paths())
  register(registerPath, {
    parentURL: pathToFileURL(__filename),
    data: { port: port2, paths },
    transferList: [port2],
  })
  let restarting = false
  const restart = debounce(async () => {
    if (restarting) return
    app.logger.info('Changes detected. Restarting...')
    restarting = true
    try {
      await app.terminate()
      await app.initialize()
    } finally {
      restarting = false
    }
  }, 250)

  port1.on('message', restart)
}
