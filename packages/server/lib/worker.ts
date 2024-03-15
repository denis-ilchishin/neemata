import { register } from 'node:module'
import {
  type MessagePort,
  isMainThread,
  parentPort,
  workerData,
} from 'node:worker_threads'
import {
  type Application,
  type BaseTaskRunner,
  WorkerType,
} from '@neematajs/application'
import {
  WorkerMessageType,
  bindPortMessageHandler,
  createBroadcastChannel,
  providerWorkerOptions,
} from './common'
import { WorkerThreadsTaskRunner } from './task-runner'

export const importDefault = (specifier: any) =>
  import(`${specifier}`).then((m) => m.default)

export type ApplicationWorkerOptions = {
  isServer: boolean
  workerType: WorkerType
  id?: number
  tasksRunner?: BaseTaskRunner
  workerOptions?: any
}

export type ApplicationWorkerData = {
  applicationPath: string
  hasTaskRunners: boolean
} & ApplicationWorkerOptions

if (!isMainThread && !process.env.VITEST) start(parentPort!, workerData)

export async function start(
  parentPort: MessagePort,
  workerData: ApplicationWorkerData,
) {
  const { id, workerOptions, applicationPath, workerType, hasTaskRunners } =
    workerData

  const { NEEMATA_SWC } = process.env

  if (NEEMATA_SWC) register(NEEMATA_SWC)

  const isApiWorker = workerType === WorkerType.Api
  const isTaskWorker = workerType === WorkerType.Task
  const tasksRunner =
    isApiWorker && hasTaskRunners
      ? new WorkerThreadsTaskRunner(parentPort)
      : undefined

  providerWorkerOptions({
    id,
    workerType,
    workerOptions,
    tasksRunner,
    isServer: true,
  })

  const app: Application = await importDefault(applicationPath)

  process.on('uncaughtException', (err) => app.logger.error(err))
  process.on('unhandledRejection', (err) => app.logger.error(err))

  bindPortMessageHandler(parentPort)

  parentPort.on(WorkerMessageType.Start, async () => {
    await app.start()
    parentPort.postMessage({ type: WorkerMessageType.Ready })
  })

  parentPort.on(WorkerMessageType.Stop, async () => {
    if (process.env.VITEST) {
      try {
        await app.stop()
      } finally {
        parentPort.postMessage({ type: 'exit' })
      }
    } else {
      try {
        await app.stop()
        process.exit(0)
      } catch (err) {
        app.logger.error(err)
        process.exit(1)
      }
    }
  })

  if (isTaskWorker) {
    parentPort.on(WorkerMessageType.ExecuteInvoke, async (payload) => {
      const { id, name, args } = payload
      const bc = createBroadcastChannel(id)

      try {
        const task = app.registry.task(name)
        if (!task) throw new Error('Task not found')
        const execution = app.execute(task, ...args)
        if (process.env.VITEST) bindPortMessageHandler(bc)
        bc.once(WorkerMessageType.ExecuteAbort, (payload) => {
          const { reason } = payload
          execution.abort(reason)
        })
        bc.postMessage({
          type: WorkerMessageType.ExecuteResult,
          payload: await execution,
        })
      } catch (error) {
        bc.postMessage({
          type: WorkerMessageType.ExecuteResult,
          payload: { error },
        })
      } finally {
        bc.close()
      }
    })
  }

  if (process.env.VITEST) parentPort.postMessage({ type: 'online' })

  return app
}
