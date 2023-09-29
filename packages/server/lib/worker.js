import { WorkerEvent } from '@neemata/common'
import { randomUUID } from 'node:crypto'
import EventEmitter from 'node:events'
import { isMainThread, parentPort, workerData } from 'node:worker_threads'
import { createConfig } from './config.js'
import { createContainer } from './container.js'
import { logger, setLoggerSettings } from './logger.js'

if (isMainThread) throw new Error('This file must be loaded in a worker thread')

const { applicationPath } = workerData

const createTaskWorker = async () => {
  const runTask = async (taskName, args, ab) => {
    const taskFactory = tasks.get(taskName)
    // @ts-expect-error
    const taskHandler = await taskFactory(container.inject)
    try {
      const result = await taskHandler(args, ab)
      return result
    } catch (error) {
      logger.error(new Error('Task faild', { cause: error }))
    }
  }

  const invoke = (taskProvider, args, options = {}) => {
    const ab = new AbortController()
    const { executionTimeout = config.tasker.timeout } = options
    // TODO: implement timeout
    const taskName = taskProvider.name
    const taskId = randomUUID()
    const task = runTask(taskName, args, ab)
    return Object.assign(task, { taskId, abort: () => ab.abort() })
  }

  /** @type {import('../types').ApplicationDeclaration} */
  const userApp = await import(applicationPath).then((module) => module.default)
  setLoggerSettings(userApp.config)
  const config = createConfig(userApp.config)
  const container = createContainer(
    config,
    { logger, invoke },
    userApp.contexts
  )
  const events = new EventEmitter()
  const tasks = new Map(userApp.tasks.map((task) => [task.name, task.factory]))

  await container.load()

  events.on(WorkerEvent.Invoke, async (payload) => {
    const { taskId, taskName, args } = payload
    const ab = new AbortController()

    events.once(taskId, () => ab.abort())

    try {
      const result = await runTask(taskName, args)
      parentPort.postMessage({
        event: WorkerEvent.Invoke,
        payload: {
          taskId,
          result,
        },
      })
    } catch (error) {
      parentPort.postMessage({
        event: WorkerEvent.Invoke,
        payload: {
          taskId,
          error,
        },
      })
    }
  })

  parentPort.on('message', (message) => {
    const { event, payload } = message
    if (event === WorkerEvent.Abort) {
      const { taskId } = payload
      events.emit(taskId)
    } else {
      events.emit(event, payload)
    }
  })
}

createTaskWorker().then(() => {
  parentPort.postMessage({
    event: WorkerEvent.Ready,
  })
})
