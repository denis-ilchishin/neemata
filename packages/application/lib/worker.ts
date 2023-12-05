import { randomUUID } from 'crypto'
//@ts-expect-error
import { register } from 'node:module'
import { MessageChannel } from 'node:worker_threads'
import { pathToFileURL } from 'url'
import { isMainThread, parentPort, workerData } from 'worker_threads'
import { Application } from './application'
import { ApplicationWorkerData, WorkerMessageType, WorkerType } from './types'
import { debounce, importDefault } from './utils/functions'
import { bindPortMessageHandler, createBroadcastChannel } from './utils/threads'

async function start() {
  const {
    id,
    applicationOptions,
    workerOptions,
    applicationPath,
    type,
    hasTaskRunners,
  }: ApplicationWorkerData = workerData

  // This example demonstrates how a message channel can be used to
  // communicate with the hooks, by sending `port2` to the hooks.
  const { port1, port2 } = new MessageChannel()

  register('./utils/loader.mjs', {
    parentURL: pathToFileURL(__filename),
    data: {
      port: port2,
      paths: [applicationOptions.api?.path, applicationOptions.tasks?.path],
    },
    transferList: [port2],
  })

  const isApiWorker = type === WorkerType.Api
  const isTaskWorker = type === WorkerType.Task
  applicationOptions.tasks.runner =
    isApiWorker && hasTaskRunners ? customTaskRunner : undefined
  applicationOptions.type = type

  let restarting = false
  const restart = debounce(async () => {
    if (restarting) return
    restarting = true
    await app.terminate()
    await app.initialize()
    restarting = false
  }, 500)

  const bootstrap = await importDefault(applicationPath)
  const app: Application = await bootstrap({
    id,
    type,
    workerOptions,
    applicationOptions,
  })

  port1.on('message', () => {
    app.logger.info('Changes detected. Restarting...')
    restart()
  })

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

if (!isMainThread) start()
else console.error(new Error('Worker should not be used in the main thread'))
