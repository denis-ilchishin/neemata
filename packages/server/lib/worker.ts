import { WorkerEvent } from '@neemata/common'
import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { isMainThread, parentPort, workerData } from 'node:worker_threads'
import { Config } from './config'
import { Container } from './container'
import { Tasks } from './tasks'

export type Task = Promise<any> & { taskId: string; abort: () => void }

export class TaskWorker extends EventEmitter {
  runningTasks = new Map<string, ReturnType<typeof this.runTask>>()

  constructor(
    public readonly config: Config,
    public readonly tasks: Tasks,
    public readonly container: Container
  ) {
    super()
  }

  static async create(options: ApplicationOptions): Promise<TaskWorker> {
    const config = new Config(options)
    const tasks = new Tasks(config)
    const container = new Container(config, tasks, () => ({
      logger: config.logger,
      invoke: worker.invoke.bind(worker),
    }))
    const worker = new TaskWorker(config, tasks, container)

    await tasks.load()
    await container.load()

    return worker
  }

  async runTask(taskName: string, args = [], ab: AbortController) {
    const taskDefinition = this.tasks.modules.get(taskName)
    const { dependencies, task } = taskDefinition
    const ctx = await this.container.createDependencyContext(dependencies)
    ctx.signal = ab.signal
    try {
      return await task(ctx, ...args)
    } catch (error) {
      this.config.logger.error(new Error('Task faild', { cause: error }))
      throw error
    }
  }

  invoke(taskDefinition: AnyTaskDefinition, options: InvokeOptions = {}): Task {
    const ab = new AbortController()
    // TODO: implement timeout
    // TODO: implement capturing another worker from current worker
    const {
      capture,
      executionTimeout = this.config.workers.timeout,
      args = [],
    } = options
    const taskName = taskDefinition.name
    const taskId = randomUUID()
    const task = Object.assign(this.runTask(taskName, args, ab), {
      taskId,
      abort: () => ab.abort(),
    })
    this.runningTasks.set(taskId, task)
    return task
  }

  async stop() {
    await this.container.dispose()
  }
}

if (!isMainThread) {
  const { options } = workerData

  TaskWorker.create(options).then((taskWorker) => {
    const logger = taskWorker.config.logger

    taskWorker.on(WorkerEvent.Invoke, async (payload) => {
      const { taskId, taskName, args } = payload
      const ab = new AbortController()

      taskWorker.once(taskId, () => ab.abort())

      try {
        const result = await taskWorker.runTask(taskName, args, ab)
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
      logger.trace('Task worker got [%s] message', event)
      if (event === WorkerEvent.Abort) {
        // TODO: handle abortion
        const { taskId } = payload
        taskWorker.emit(taskId)
      } else {
        taskWorker.emit(event, payload)
      }
    })

    taskWorker.once(WorkerEvent.Stop, async () => {
      parentPort.close()
      logger.info('Stopping up a task worker...')
      await taskWorker.stop()
      process.exit(0)
    })

    logger.info('Started task worker...')
    parentPort.postMessage({
      event: WorkerEvent.Ready,
    })
  })
}
