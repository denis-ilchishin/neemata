import { join } from 'node:path'
import { Worker } from 'node:worker_threads'
import { Application } from '..'
import { BaseAdapter } from './adapter'
import { Logger, createLogger } from './logger'
import {
  ApplicationOptions,
  ApplicationWorkerOptions,
  WorkerMessageType,
  WorkerType,
} from './types'
import { Pool } from './utils/pool'

const IGNORE_ARGS = ['--inspect-brk', '--inspect', '--inspect-port', '--watch']

export type ApplicationServerOptions = {
  applicationPath: string | URL
  applicationOptions: ApplicationOptions
  taskWorkers: number | object[]
  apiWorkers: number | object[]
}

export class ApplicationServer<Adapter extends BaseAdapter = never> {
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
      this.createWorker(type, { id, options })
    }
  }

  private createWorker(type: WorkerType, options = {}) {
    const isTaskWorker = type === WorkerType.Task
    const execArgv = process.execArgv.filter(
      (arg) => !IGNORE_ARGS.includes(arg)
    )
    const workerData: ApplicationWorkerOptions = {
      type: WorkerType.Task,
      applicationPath: this.options.applicationPath.toString(),
      options,
    }
    const worker = new Worker(join(__dirname, 'worker'), {
      name: type,
      execArgv,
      workerData,
    })

    this.workers.add(worker)

    worker.on('error', (error) => this.logger.error(error))
    worker.on('exit', (code) => {
      this.workers.delete(worker)
      if (isTaskWorker) this.pool.remove(worker)
      if (code !== 0) {
        this.logger.fatal(`Worker ${worker.threadId} crashed with code ${code}`)
        this.createWorker(type, options) // restart the worker on crash
        if (isTaskWorker) this.pool.add(worker)
      } else {
        this.logger.info(`Worker ${worker.threadId} exited gracefully`)
      }
    })
    worker.on('message', (message) => {
      if (message && typeof message === 'object') {
        const { type, payload } = message
        worker.emit(type, payload)
      }
    })

    return worker
  }
}

export const createApp = (
  callback: (options: {
    id: number
    type: WorkerType
    options?: any
  }) => Promise<Application> | Application
) => callback
