import { register } from 'node:module'

import { randomUUID } from 'crypto'
import { isMainThread, parentPort, workerData } from 'worker_threads'
import { Application, ApplicationWorkerOptions } from './application'
import { WorkerMessageType, WorkerType } from './types'
import { importDefault } from './utils/functions'
import { bindPortMessageHandler, createBroadcastChannel } from './utils/threads'
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

if (!isMainThread) start()

async function start() {
  const { NEEMATA_SWC, NEEMATA_WATCH } = process.env

  if (NEEMATA_SWC) register(NEEMATA_SWC)

  const isApiWorker = type === WorkerType.Api
  const isTaskWorker = type === WorkerType.Task
  const tasksRunner =
    isApiWorker && hasTaskRunners ? customTaskRunner : undefined

  const bootstrap = await importDefault(applicationPath)
  const app: Application = await bootstrap({
    id,
    type,
    workerOptions,
    tasksRunner,
  })

  process.on('uncaughtException', (err) => app.logger.error(err))
  process.on('unhandledRejection', (err) => app.logger.error(err))

  if (NEEMATA_WATCH) watchApp(NEEMATA_WATCH, app)

  bindPortMessageHandler(parentPort)

  parentPort.on(WorkerMessageType.Start, async () => {
    await app.start()
    parentPort.postMessage({ type: WorkerMessageType.Ready })
  })

  parentPort.on(WorkerMessageType.Stop, async () => {
    await app.stop()
    process.exit(0)
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

  function customTaskRunner(signal: AbortSignal, name: string, ...args: any[]) {
    if (!name) throw new Error('Task name is required')
    const id = randomUUID()

    // TODO: performance is 15-17% worse than passing events via the main thread manually
    // mini bench (node v20.9.0, M1 mbp): 21-22k vs 25-26k
    // need to investigate further and see if there's a way to improve this
    const bc = createBroadcastChannel(id)

    const result = new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), {
        once: true,
      })
      bc.emitter.once(WorkerMessageType.ExecuteResult, (payload) => {
        const { error, result } = payload
        if (error) reject(error)
        else resolve(result)
        bc.close()
      })
    })

    parentPort.postMessage({
      type: WorkerMessageType.ExecuteInvoke,
      payload: { id, name, args },
    })

    const abort = () =>
      bc.channel.postMessage({ type: WorkerMessageType.ExecuteAbort })

    signal.addEventListener('abort', abort, { once: true })

    return result
  }

  return app
}
