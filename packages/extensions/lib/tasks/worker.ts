import { Container, Logger, createLogger } from '@neemata/application'
import { isMainThread, parentPort, workerData } from 'node:worker_threads'
import { Tasks } from '.'
import { WorkerEvent } from './types'

export class TaskWorker {
  logger: Logger
  container: Container<Tasks>

  constructor(
    readonly tasks: Tasks,
    readonly options: {
      logLevel: string
    }
  ) {
    this.logger = createLogger(options.logLevel as any, 'TaskWorker')
    this.container = new Container({
      context: { isTask: true },
      loader: this.tasks,
      logger: this.logger,
    })
  }

  async initialize() {
    await this.tasks.load()
    await this.container.load()
  }

  async terminate() {
    await this.container.dispose()
  }

  async runTask(payload) {
    const { taskName, args = [], signal } = payload
    const declaration = this.tasks.modules.get(taskName)
    const { task, dependencies } = declaration
    const context = await this.container.context(dependencies, { signal })
    return await task(context, ...args)
  }
}

if (!isMainThread) {
  const { isNeemataExtension, extensionPath, options } = workerData
  const aborts = new Map()
  if (isNeemataExtension) {
    const eventName = (event: string) => `event:${event}`

    ;(async () => {
      const extension = await import(extensionPath).then(
        ({ default: extension }) => extension
      )
      const worker = new TaskWorker(extension.tasks, options)
      await worker.initialize()

      parentPort.on('message', (message) => {
        if (typeof message === 'object') {
          const { event, payload } = message
          if (typeof event === 'string') {
            parentPort.emit(eventName(event), payload)
          }
        }
      })

      parentPort.on(eventName(WorkerEvent.Invoke), async (payload) => {
        const { taskId, ...rest } = payload
        try {
          const ac = new AbortController()
          aborts.set(taskId, (reason) => ac.abort(reason))
          const result = await worker.runTask({ ...rest, signal: ac.signal })
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

      parentPort.once(eventName(WorkerEvent.Abort), ({ taskId, reason }) => {
        aborts.get(taskId)?.(new Error(reason))
      })

      parentPort.once(eventName(WorkerEvent.Stop), async () => {
        await worker.terminate()
        process.exit(0)
      })

      parentPort.postMessage({ event: WorkerEvent.Ready })
    })()
  }
}
