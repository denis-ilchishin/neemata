import { TaskError, WorkerEvent } from '@neemata/common'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { Worker } from 'node:worker_threads'
import { logger } from './logger.js'
import { createPool } from './pool.js'

/**
 * @param {import('./config').Config} config
 * @param {import('../types').ApplicationDeclaration} userApp
 */
export const createTasker = (config, userApp) => {
  /**
   * @type {import('./pool.js').Pool<Worker>}
   */
  const workerPool = createPool(0, { timeout: config.tasker.timeout })
  const tasks = new Map(
    userApp.tasks ? userApp.tasks.map((task) => [task.name, task]) : []
  )

  const spinWorker = async () => {
    const worker = new Worker(join(__dirname, 'worker.js'), {
      execArgv: process.execArgv,
      env: process.env,
      workerData: {
        applicationPath: config.applicationPath,
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

    logger.trace('Waiting for worker to be ready ...')
    await new Promise((r) => worker.once(WorkerEvent.Ready, r))
    logger.trace('Worker is ready')
    return worker
  }

  const start = async () => {
    logger.debug('Spinning up task workers ...')
    const workers = []
    for (let i = 0; i < config.tasker.workers; i++) workers.push(spinWorker())
    for (const worker of await Promise.all(workers)) workerPool.add(worker)
  }

  const stop = async () => {
    logger.debug('Stopping task workers ...')
    for (const worker of workerPool.items) {
      // TODO: add gracefull shutdown
      worker.terminate()
    }
  }

  /**
   * @param {import('../types').Task} taskProvider
   * @param {*} args
   * @param {*} options
   */
  const invoke = async (taskProvider, args = [], options = {}) => {
    if (!taskProvider) throw new TaskError('Task is required')
    const {
      executionTimeout = config.tasker.timeout,
      poolTimeout = config.tasker.timeout,
      capture = false,
    } = options
    const taskName = taskProvider.name
    logger.trace('Invoking [%s] task ...', taskName)
    if (!tasks.has(taskName))
      throw new TaskError(`Task "${taskName}" not found`)

    const ac = new AbortController()
    const taskId = randomUUID()

    const releaseWorker = (worker) => {
      if (capture && !workerPool.isFree(worker)) {
        workerPool.release(worker)
      }
    }

    const task = new Promise((resolve, reject) => {
      logger.trace('Pooling a worker for [%s] task ...', taskName)
      workerPool[capture ? 'capture' : 'next'](poolTimeout)
        .then(async (worker) => {
          const timer = setTimeout(() => {
            worker.postMessage({
              event: WorkerEvent.Abort,
              payload: { taskId },
            })
          }, executionTimeout)

          worker.once(taskId, ({ error, result }) => {
            logger.trace(
              'Finishing [%s] task with [%s]...',
              taskName,
              error ? 'error' : 'success'
            )
            releaseWorker(worker)
            if (timer) clearTimeout(timer)

            if (error) reject(error)
            else resolve(result)
          })

          logger.trace('Invoking [%s] task ...', taskName)
          worker.postMessage({
            event: WorkerEvent.Invoke,
            payload: { taskId, taskName, args },
          })
        })
        .catch((error) => {
          if (error.message === 'Pool next item timeout')
            reject(new TaskError('Worker pool timeout'))
          else reject(error)
        })
    })

    return Object.assign(task, { taskId, abort: () => ac.abort() })
  }

  return {
    start,
    stop,
    invoke,
  }
}
