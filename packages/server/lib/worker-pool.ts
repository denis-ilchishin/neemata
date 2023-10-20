import { TaskError, WorkerEvent } from '@neemata/common'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { Worker } from 'node:worker_threads'
import { Config } from './config'
import { Tasks } from './tasks'
import { TASK_SYMBOL } from './utils/definitions'
import { Pool, PoolError } from './utils/pool'

export class TaskWorkerPool {
  pool: Pool<Worker>

  private get logger() {
    return this.config.logger
  }

  constructor(
    private readonly config: Config,
    private readonly tasks: Tasks,
    private readonly options: ApplicationOptions
  ) {
    this.pool = new Pool({ timeout: config.workers?.timeout })
  }

  async start() {
    this.logger.debug('Spinning up task workers ...')
    const workers = []
    const workersNumber = this.config.workers.number
    for (let i = 0; i < workersNumber; i++) workers.push(this.startWorker())
    for (const worker of await Promise.all(workers)) this.pool.add(worker)
  }

  async stop() {
    this.logger.debug('Stopping task workers ...')

    await Promise.all(
      this.pool.items.map(
        (worker) =>
          new Promise((resolve) => {
            worker.once('exit', resolve)
            worker.postMessage({ event: WorkerEvent.Stop })
          })
      )
    )

    this.logger.trace('Workers successfully stopped ...')
  }

  async invoke(taskDefinition: AnyTaskDefinition, options: InvokeOptions = {}) {
    if (!taskDefinition) throw new TaskError('Task is required')
    const taskName = taskDefinition.name

    if (taskDefinition.injectableType !== TASK_SYMBOL)
      throw new TaskError('Task is invalid')
    if (!this.tasks.modules.has(taskName))
      throw new TaskError(`Task "${taskName}" not found`)

    const {
      executionTimeout = this.config.workers.timeout,
      poolTimeout = this.config.workers.timeout,
      capture = false,
      args = [],
    } = options

    const ac = new AbortController()
    const taskId = randomUUID()

    const releaseWorker = (worker) => {
      if (capture && !this.pool.isFree(worker)) {
        this.pool.release(worker)
      }
    }

    const task = new Promise((resolve, reject) => {
      // TODO: is it necessary to await for a task-free worker on capture?
      this.pool[capture ? 'capture' : 'next'](poolTimeout)
        .then(async (worker) => {
          const timer = setTimeout(() => {
            worker.postMessage({
              event: WorkerEvent.Abort,
              payload: { taskId },
            })
          }, executionTimeout)

          worker.once(taskId, ({ error, result }) => {
            releaseWorker(worker)
            if (timer) clearTimeout(timer)

            if (error) reject(error)
            else resolve(result)
          })

          worker.postMessage({
            event: WorkerEvent.Invoke,
            payload: { taskId, taskName, args },
          })
        })
        .catch((cause) => {
          const isPoolError = cause instanceof PoolError
          if (isPoolError) reject(new TaskError('Worker pool error', { cause }))
          else reject(cause)
        })
    })

    return Object.assign(task, { taskId, abort: () => ac.abort() })
  }

  private async startWorker() {
    // TODO: implement auto restart on worker's unexpexted crash/shutdown
    const worker = new Worker(join(__dirname, 'worker'), {
      execArgv: process.execArgv,
      env: process.env,
      workerData: {
        options: {
          ...this.options,
          errorHandlers: undefined, // TODO: unable to clone
        },
      },
    })

    worker.on('message', (message) => {
      if (typeof message === 'object') {
        const { event, payload } = message
        if (event) {
          if (event === WorkerEvent.Invoke) {
            const { taskId, error, result } = payload
            worker.emit(taskId, { error, result })
          } else {
            worker.emit(event, payload)
          }
        }
      }
    })

    this.logger.trace('Waiting for worker to be ready ...')
    await new Promise((r) => worker.once(WorkerEvent.Ready, r))
    this.logger.trace('Worker is ready')
    return worker
  }
}
