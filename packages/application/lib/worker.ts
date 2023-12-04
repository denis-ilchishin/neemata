import { randomUUID } from 'crypto'
import { isMainThread, parentPort, workerData } from 'worker_threads'
import { Application } from './application'
import {
  ApplicationWorkerOptions,
  WorkerMessageType,
  WorkerType,
} from './types'
import { importDefault } from './utils/functions'
import { bindPortMessageHandler, createBroadcastChannel } from './utils/threads'

async function run() {
  const {
    id,
    applicationOptions,
    workerOptions,
    applicationPath,
    type,
  }: ApplicationWorkerOptions = workerData
  const isApiWorker = type === WorkerType.Api
  const isTaskWorker = type === WorkerType.Task
  applicationOptions.tasks.runner = isApiWorker ? taskRunner : undefined

  const bootstrap = await importDefault(applicationPath)
  const app: Application = await bootstrap({
    id,
    type,
    workerOptions,
    applicationOptions,
  })

  bindPortMessageHandler(parentPort)

  parentPort.on(WorkerMessageType.Start, async () => {
    await app.initialize()
    if (isApiWorker) await app.start()
    parentPort.postMessage({ type: WorkerMessageType.Ready })
  })

  parentPort.on(WorkerMessageType.Stop, async () => {
    if (isApiWorker) await app.stop()
    await app.terminate()
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
        app.logger.error(error)
        bc.channel.postMessage({
          type: WorkerMessageType.ExecuteResult,
          payload: { error },
        })
      } finally {
        bc.close()
      }
    })
  }

  async function taskRunner(signal: AbortSignal, name: string, ...args: any[]) {
    const id = randomUUID()

    // TODO: performance is 15-17% worse than passing events via the main thread manually
    // mini bench (node v20.9.0, M1 mbp): 21-22k vs 25-26k
    // need to investigate further and see if there's a way to improve this
    const bc = createBroadcastChannel(id)

    const result = new Promise((resolve, reject) => {
      signal.addEventListener('abort', reject, { once: true })
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
}

if (!isMainThread) run()
