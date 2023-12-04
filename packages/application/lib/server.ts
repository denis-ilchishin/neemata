import { join } from 'node:path'
import { Worker } from 'node:worker_threads'
import { Logger, createLogger } from './logger'
import {
  ApplicationOptions,
  ApplicationWorkerOptions,
  WorkerMessageType,
  WorkerType,
} from './types'

import { Pool } from './utils/pool'
import { bindPortMessageHandler } from './utils/threads'

const IGNORE_ARGS = ['--inspect-brk', '--inspect', '--inspect-port', '--watch']

export type ApplicationServerOptions = {
  applicationPath: string | URL
  applicationOptions: ApplicationOptions
  taskWorkers: number | object[]
  apiWorkers: number | object[]
}

export class ApplicationServer {
  logger: Logger
  workers: Set<Worker> = new Set()
  pool: Pool<Worker> = new Pool()

  constructor(private readonly options: ApplicationServerOptions) {
    this.logger = createLogger(
      options.applicationOptions.logging?.level || 'info',
      'Neemata'
    )
  }

  async start() {
    const { apiWorkers, taskWorkers } = this.options

    this.createWorkers(WorkerType.Task, taskWorkers)
    this.createWorkers(WorkerType.Api, apiWorkers)

    for (const worker of this.workers) {
      await new Promise((resolve, reject) => {
        worker.once(WorkerMessageType.Ready, resolve)
        worker.once('error', reject)
        worker.postMessage({ type: WorkerMessageType.Start })
      })
    }
  }

  async stop() {
    for (const worker of this.workers) {
      await new Promise((resolve) => {
        worker.once('exit', resolve)
        worker.postMessage({ type: WorkerMessageType.Stop })
      })
    }
  }

  private createWorkers(type: WorkerType, workers: number | object[]) {
    const count = typeof workers === 'number' ? workers : workers.length
    for (let id = 0; id < count; id++) {
      const options = typeof workers === 'number' ? {} : workers[id]
      this.createWorker(type, id, options)
    }
  }

  private createWorker(type: WorkerType, id: number, options: any) {
    const isTaskWorker = type === WorkerType.Task
    const execArgv = process.execArgv.filter(
      (arg) => !IGNORE_ARGS.includes(arg)
    )
    const workerData: ApplicationWorkerOptions = {
      applicationPath: this.options.applicationPath.toString(),
      id,
      type,
      applicationOptions: this.options.applicationOptions,
      workerOptions: options,
    }

    const worker = new Worker(join(__dirname, 'worker'), {
      name: type,
      execArgv,
      workerData,
    })

    bindPortMessageHandler(worker)

    worker.on('error', (error) => this.logger.error(error))
    worker.on('exit', (code) => {
      this.workers.delete(worker)
      if (isTaskWorker && this.pool.items.includes(worker))
        this.pool.remove(worker)
      if (code !== 0) {
        this.logger.fatal(`Worker ${worker.threadId} crashed with code ${code}`)
        // this.createWorker(type, options) // restart the worker on crash
        // if (isTaskWorker) this.pool.add(worker)
      } else {
        this.logger.info(`Worker ${worker.threadId} exited gracefully`)
      }
    })

    this.workers.add(worker)

    if (!isTaskWorker) {
      worker.on(WorkerMessageType.ExecuteInvoke, async (payload) => {
        const worker = await this.pool.next()
        worker.postMessage({
          type: WorkerMessageType.ExecuteInvoke,
          payload,
        })
      })
    } else {
      this.pool.add(worker)
    }

    return worker
  }
}

export const createApp = <T extends any>(
  callback: (options: Omit<ApplicationWorkerOptions, 'applicationPath'>) => T
) => callback
