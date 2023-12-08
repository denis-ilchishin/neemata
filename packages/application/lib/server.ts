import { join } from 'node:path'
import { Worker } from 'node:worker_threads'
import { Logger, LoggingOptions, createLogger } from './logger'
import { WorkerMessageType, WorkerType } from './types'

import { Pool } from './utils/pool'
import { bindPortMessageHandler } from './utils/threads'
import { ApplicationWorkerData } from './worker'

const IGNORE_ARGS = ['--inspect-brk', '--inspect', '--inspect-port']

export type ApplicationServerOptions = {
  applicationPath: string | URL
  logging?: LoggingOptions
  taskWorkers: number | any[]
  apiWorkers: number | any[]
}

export class ApplicationServer {
  logger: Logger
  workers: Set<Worker> = new Set()
  taskRunners: Pool<Worker> = new Pool()

  #exiting = false

  constructor(readonly options: ApplicationServerOptions) {
    this.logger = createLogger(this.options.logging, 'Neemata')
  }

  async start() {
    this.logger.info('Starting application server...')
    const { apiWorkers, taskWorkers } = this.options

    this.logger.debug('Spinning up task workers...')
    this.createWorkers(WorkerType.Task, taskWorkers)

    this.logger.debug('Spinning up task api workers...')
    this.createWorkers(WorkerType.Api, apiWorkers)

    for (const worker of this.workers) {
      await new Promise<void>((resolve, reject) => {
        const onError = (err) => {
          this.logger.fatal(err)
          this.stop()
        }
        worker.once(WorkerMessageType.Ready, () => {
          worker.off('error', onError)
          resolve()
        })
        worker.once('error', onError)
        worker.postMessage({ type: WorkerMessageType.Start })
      })
    }
  }

  async stop() {
    this.logger.info('Stopping application server...')
    this.#exiting = true
    for (const worker of this.workers) {
      await new Promise((resolve) => {
        worker.once('exit', resolve)
        worker.postMessage({ type: WorkerMessageType.Stop })
      })
    }
    this.#exiting = false
  }

  private createWorkers(type: WorkerType, workers: number | object[]) {
    const count = typeof workers === 'number' ? workers : workers.length
    for (let id = 0; id < count; id++) {
      const options = typeof workers === 'number' ? undefined : workers[id]
      this.createWorker(type, id, options)
    }
  }

  private createWorker(type: WorkerType, id: number, options: any) {
    const isTaskWorker = type === WorkerType.Task
    const execArgv = process.execArgv.filter(
      (arg) => !IGNORE_ARGS.includes(arg)
    )
    const { applicationPath, taskWorkers } = this.options

    const workerData: ApplicationWorkerData = {
      applicationPath: applicationPath.toString(),
      id,
      type,
      workerOptions: options,
      hasTaskRunners: !!taskWorkers,
    }

    const worker = new Worker(join(__dirname, 'worker'), {
      name: type,
      execArgv,
      workerData,
    })

    const threadId = worker.threadId

    bindPortMessageHandler(worker)

    worker.on('error', (error) => this.logger.error(error))
    worker.on('exit', (code) => {
      this.workers.delete(worker)
      if (isTaskWorker && this.taskRunners.items.includes(worker))
        this.taskRunners.remove(worker)

      if (code !== 0) {
        this.logger.fatal(`Worker ${threadId} crashed with code ${code}`)
        if (!this.#exiting) {
          // restart on unexpected crash
          const worker = this.createWorker(type, id, options)
          worker.postMessage({ type: WorkerMessageType.Start })
        }
      } else {
        this.logger.info(`Worker ${threadId} exited gracefully`)
      }
    })

    this.workers.add(worker)

    if (!isTaskWorker) {
      worker.on(WorkerMessageType.ExecuteInvoke, async (payload) => {
        const worker = await this.taskRunners.next()
        worker.postMessage({
          type: WorkerMessageType.ExecuteInvoke,
          payload,
        })
      })
    } else {
      this.taskRunners.add(worker)
    }

    return worker
  }
}
