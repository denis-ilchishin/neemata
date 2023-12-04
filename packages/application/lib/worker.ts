import { isMainThread, parentPort, workerData } from 'worker_threads'
import { Application } from './application'
import {
  ApplicationWorkerOptions,
  WorkerMessageType,
  WorkerType,
} from './types'
import { importDefault } from './utils/functions'

async function run() {
  const { options, applicationPath, type }: ApplicationWorkerOptions =
    workerData
  const isApiWorker = type === WorkerType.Api
  const isTaskWorker = type === WorkerType.Task
  options.runner = isApiWorker ? taskRunner : undefined
  const bootstrap = await importDefault(applicationPath)
  const app: Application = await bootstrap(options)

  parentPort.on('message', (message) => {
    if (message && typeof message === 'object') {
      const { type, payload } = message
      parentPort.emit(type, payload)
    }
  })

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
      const { port, name, args } = payload
      try {
        const task = app.tasks.execute(app.container, name, ...args)
        port.abort(WorkerMessageType.ExecuteAbort, (payload) => {
          const { reason } = payload
          task.abort(reason)
        })
        const result = await task.result
        port.postMessage({
          type: WorkerMessageType.ExecuteResult,
          payload: { result },
        })
      } catch (error) {
        port.postMessage({
          type: WorkerMessageType.ExecuteResult,
          payload: { error },
        })
      }
    })
  }

  async function taskRunner(signal: AbortSignal, name: string, ...args: any[]) {
    // TODO: need to measure performance between creating new MessageChannel for each task invocation
    // and sending messages through the parentPort with correlation ids
    const { port1, port2 } = new MessageChannel()

    const result = new Promise((resolve, reject) => {
      signal.addEventListener('abort', reject, { once: true })
      port1.once(WorkerMessageType.ExecuteResult, (payload) => {
        const { error, result } = payload
        if (error) reject(error)
        else resolve(result)
      })
      port1.close()
    })

    parentPort.postMessage({
      type: WorkerMessageType.ExecuteInvoke,
      payload: { port: port2, name, args },
    })

    signal.addEventListener(
      'abort',
      () => port2.postMessage({ type: WorkerMessageType.ExecuteAbort }),
      { once: true }
    )

    return result
  }
}

if (!isMainThread) run()
