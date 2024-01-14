import { randomUUID } from 'crypto'
import { MessagePort } from 'worker_threads'
import { BaseTaskRunner } from '../tasks'
import { WorkerMessageType } from '../types'
import { createBroadcastChannel } from '../utils/threads'

export class WorkerThreadsTaskRunner extends BaseTaskRunner {
  constructor(private readonly port: MessagePort) {
    super()
  }

  execute(signal: AbortSignal, name: string, ...args: any[]) {
    if (!name) throw new Error('Task name is required')

    const id = randomUUID()

    // TODO: performance is 15-17% worse than passing events via the main thread manually
    // mini bench (node v20.9.0, M1 mbp): 21-22k vs 25-26k per seconds
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

    this.port.postMessage({
      type: WorkerMessageType.ExecuteInvoke,
      payload: { id, name, args },
    })

    const abort = () =>
      bc.channel.postMessage({ type: WorkerMessageType.ExecuteAbort })

    signal.addEventListener('abort', abort, { once: true })

    return result
  }
}
