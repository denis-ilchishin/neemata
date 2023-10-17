import { Api } from './lib/api'
import { Config } from './lib/config'
import { Container } from './lib/container'
import { Server } from './lib/protocol/server'
import { Tasks } from './lib/tasks'
import { TaskWorkerPool } from './lib/worker-pool'

export class App {
  config: Config
  server: Server
  container: Container
  api: Api
  workerPool?: TaskWorkerPool
  tasks?: Tasks

  private get logger() {
    return this.config.logger
  }

  constructor(private readonly options: ApplicationOptions) {
    this.config = new Config(options)
    this.logger.debug('Creating the application...')

    this.api = new Api(this.config)
    this.server = new Server(this.config, this.api)

    if (this.config.workers?.number) {
      this.tasks = new Tasks(this.config)
      this.workerPool = new TaskWorkerPool(this.config, this.tasks, options)
    }

    this.container = new Container(this.config, this.api, () => ({
      logger: this.config.logger,
      websockets: this.server.websockets,
      rooms: this.server.rooms,
      invoke: this.workerPool
        ? this.workerPool.invoke.bind(this.workerPool)
        : () => Promise.reject('Workers are not enabled'),
    }))

    this.server.setGlobalContainer(this.container)
  }

  async start() {
    this.logger.info('Starting the application...')

    this.logger.debug('Loading api procedures...')
    await this.api.load()

    this.logger.debug('Loading default contexts...')
    await this.container.load()

    if (this.workerPool) {
      this.logger.debug('Spinning up tasker workers...')
      await this.tasks.load()
      await this.workerPool.start()
    }

    this.logger.debug('Starting the server...')
    await this.server.start()
  }

  async stop() {
    this.logger.info('Stopping the application...')
    await this.server.stop()
    await this.container.dispose()
    if (this.workerPool) await this.workerPool.stop()
  }
}

export { ApiError, ErrorCode, TaskError, Transport } from '@neemata/common'
export { type Stream } from './lib/protocol/server'
export {
  defineApplication,
  defineContext,
  defineProcedure,
  defineProvider,
  defineTask,
} from './lib/utils/definitions'
