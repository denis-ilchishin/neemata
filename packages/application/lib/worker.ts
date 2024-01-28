import { register } from 'node:module'
import {
  MessagePort,
  isMainThread,
  parentPort,
  workerData,
} from 'node:worker_threads'

import { Application, ApplicationWorkerOptions } from './application'
import { WorkerThreadsTaskRunner } from './task-runners/worker-threads'
import { WorkerMessageType, WorkerType } from './types'
import { importDefault } from './utils/functions'
import {
  bindPortMessageHandler,
  createBroadcastChannel,
  providerWorkerOptions,
} from './utils/threads'
import { watchApp } from './utils/watch'

export type ApplicationWorkerData = {
  applicationPath: string
  hasTaskRunners: boolean
} & ApplicationWorkerOptions

if (!isMainThread && !process.env.VITEST) start(parentPort!, workerData)

export async function start(
  parentPort: MessagePort,
  workerData: ApplicationWorkerData,
) {
  const { id, workerOptions, applicationPath, type, hasTaskRunners } =
    workerData

  const { NEEMATA_SWC, NEEMATA_WATCH } = process.env

  if (NEEMATA_SWC) register(NEEMATA_SWC)

  const isApiWorker = type === WorkerType.Api
  const isTaskWorker = type === WorkerType.Task
  const tasksRunner =
    isApiWorker && hasTaskRunners
      ? new WorkerThreadsTaskRunner(parentPort)
      : undefined

  providerWorkerOptions({
    id,
    type,
    workerOptions,
    tasksRunner,
  })

  const app: Application = await importDefault(applicationPath)

  process.on('uncaughtException', (err) => app.logger.error(err))
  process.on('unhandledRejection', (err) => app.logger.error(err))

  if (NEEMATA_WATCH) watchApp(NEEMATA_WATCH, app)

  bindPortMessageHandler(parentPort)

  parentPort.on(WorkerMessageType.Start, async () => {
    await app.start()
    parentPort.postMessage({ type: WorkerMessageType.Ready })
  })

  parentPort.on(WorkerMessageType.Stop, async () => {
    try {
      await app.stop()
      if (!process.env.VITEST) process.exit(0)
    } catch (err) {
      if (!process.env.VITEST) {
        app.logger.error(err)
        process.exit(1)
      }
    } finally {
      if (process.env.VITEST) parentPort.postMessage({ type: 'exit' })
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
