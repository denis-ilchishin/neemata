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
  tasks: Tasks
  workerPool?: TaskWorkerPool

  private starting: Promise<void>

  private get logger() {
    return this.config.logger
  }

  constructor(private readonly options: ApplicationOptions) {
    this.config = new Config(options)
    this.api = new Api(this.config)
    this.server = new Server(this)
    this.tasks = new Tasks(this.config)

    if (this.config.workers?.number) {
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
  }

  async start() {
    this.starting = (async () => {
      this.logger.info('Starting the application...')

      await this.api.load()
      await this.container.load()

      if (this.workerPool) {
        await this.tasks.load()
        await this.workerPool.start()
      }

      await this.server.start()
    })()

    return this.starting
  }

  async stop() {
    this.logger.info('Stopping the application...')
    await this.starting
    await this.server.stop()
    await this.container.dispose()
    if (this.workerPool) await this.workerPool.stop()
  }

  resolve<T extends AnyProviderDefinition | AnyContextDefinition>(
    injectable: T
  ): Promise<ResolvedDependencyInjection<T>> {
    return this.container.resolve(injectable)
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
