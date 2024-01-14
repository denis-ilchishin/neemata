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

const {
  id,
  workerOptions,
  applicationPath,
  type,
  hasTaskRunners,
}: ApplicationWorkerData = workerData

if (!isMainThread) start(parentPort!)

async function start(parentPort: MessagePort) {
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
    await app
      .stop()
      .then(() => {
        process.exit(0)
      })
      .catch((err) => {
        app.logger.error(err)
        process.exit(1)
      })
  })

  if (isTaskWorker) {
    parentPort.on(WorkerMessageType.ExecuteInvoke, async (payload) => {
      const { id, name, args } = payload
      const bc = createBroadcastChannel(id)
      try {
        const task = app.tasks.execute(app.container, name, ...args)
        bc.emitter.on(WorkerMessageType.ExecuteAbort, (payload) => {
          const { reason } = payload
          task.abort(reason)
        })
        const result = await task.result
        bc.channel.postMessage({
          type: WorkerMessageType.ExecuteResult,
          payload: { result },
        })
      } catch (error) {
        bc.channel.postMessage({
          type: WorkerMessageType.ExecuteResult,
          payload: { error },
        })
      } finally {
        bc.close()
      }
    })
  }

  return app
}
