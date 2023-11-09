import type { InvokeOptions, Tasks } from './index'

import { createLogger, defer } from '@neemata/application'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { join } from 'node:path'
import { Worker } from 'node:worker_threads'
import { Pool, PoolError } from '../utils'
import { TaskInterface, WorkerEvent } from './types'

export type TaskWorkerPoolOptions = {
  extensionPath: string
  size: number
  logLevel?: Parameters<typeof createLogger>[0]
  timeout?: number
  capture?: boolean
}

export class TaskError extends Error {}

export class TaskWorkerPool {
  workerPool: Pool<Worker>
  private results = new Map<string, { resolve: any; reject: any }>()

  constructor(
    private readonly options: TaskWorkerPoolOptions,
    private readonly loader: Tasks
  ) {
    this.workerPool = new Pool({ timeout: options.timeout })
  }

  async start() {
    const workers = []
    for (let i = 0; i < this.options.size; i++) {
      workers.push(this.createWorker(i))
    }
    await Promise.all(workers)
  }

  async stop() {
    const workers = []
    for (const worker of this.workerPool.items) {
      workers.push(once(worker, 'exit'))
      worker.postMessage({ event: WorkerEvent.Stop })
    }
    await Promise.all(workers)
  }

  invoke(
    taskName: string,
    options: InvokeOptions,
    args: any[]
  ): TaskInterface<any> {
    const taskId = randomUUID()
    const ac = new AbortController()
    const abort = (reason?: string) => ac.abort(reason ?? 'Aborted')
    const result = this.createResult(taskId)
    defer(() => this.runTask(taskId, taskName, options, args, ac.signal))
    return { result, taskId, abort }
  }

  private runTask(
    taskId: string,
    taskName: string,
    options: InvokeOptions,
    args: any[],
    signal: AbortSignal
  ) {
    const { reject } = this.results.get(taskId)
    const task = this.loader.modules.get(taskName)
    if (!task) reject(new Error('Task not found'))
    const capture = options.capture ?? this.options.capture
    const method = capture ? 'capture' : 'next'
    this.workerPool[method](options.poolTimeout)
      .then((worker) => {
        const abortionHander = () => {
          reject(new Error(signal.reason))
          worker.postMessage({
            event: WorkerEvent.Abort,
            payload: {
              taskId,
              reason: signal.reason,
            },
          })
        }
        signal.addEventListener('abort', abortionHander, { once: true })

        worker.postMessage({
          event: WorkerEvent.Invoke,
          payload: {
            taskId,
            taskName,
            args,
          },
        })
      })
      .catch((error) => {
        if (error instanceof PoolError) {
          reject(new Error('Pool timeout'))
        } else {
          reject(error)
        }
      })
  }

  private async createWorker(i: number) {
    const workerData = {
      isNeemataExtension: true,
      extensionPath: this.options.extensionPath,
      options: {
        logLevel: this.options.logLevel,
      },
    }
    const worker = new Worker(join(__dirname, './worker'), {
      execArgv: process.execArgv,
      workerData,
      name: `TaskWorker ${i}`,
    })

    worker.once('exit', (exitCode) => {
      this.workerPool.remove(worker)
      // TODO: test autorestart out
      // if (exitCode) this.createWorker()
    })

    worker.on('message', (message) => {
      if (typeof message === 'object') {
        const { event, payload } = message
        if (typeof event === 'string') {
          worker.emit(this.eventName(event), payload)
        }
      }
    })

    worker.on(this.eventName(WorkerEvent.Invoke), (payload) => {
      const { taskId, result, error } = payload
      const taskResult = this.results.get(taskId)
      if (taskResult) {
        if (error) taskResult.reject(new Error(error))
        else taskResult.resolve(result)
      }
    })

    await once(worker, this.eventName(WorkerEvent.Ready))

    this.workerPool.add(worker)
  }

  private eventName(event: string) {
    return `event:${event}`
  }

  private createResult(taskId: string) {
    return new Promise((resolve, reject) =>
      this.results.set(taskId, {
        resolve,
        reject: (cause) => reject(new TaskError('Task failed', { cause })),
      })
    )
      .finally(() => this.results.delete(taskId))
      .catch((error) => {
        throw error
      })
  }
}
