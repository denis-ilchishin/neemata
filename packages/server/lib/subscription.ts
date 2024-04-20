import { isMainThread } from 'node:worker_threads'
import {
  BasicSubscriptionManager,
  type Event,
  Hook,
} from '@neematajs/application'
import { createBroadcastChannel } from './common'

export const WORKER_THREADS_SM_MESSAGE = 'wt_sm_message'
export const WORKER_THREADS_SM_CHANNEL = 'wt_sm_channel'

export class WorkerThreadsSubscriptionManager extends BasicSubscriptionManager {
  name = 'Worker subscription manager'

  protected bc?: ReturnType<typeof createBroadcastChannel>

  initialize() {
    if (!isMainThread) {
      this.bc = createBroadcastChannel(WORKER_THREADS_SM_CHANNEL)

      if (this.isApiWorker) {
        this.application.registry.hooks.add(Hook.BeforeStart, () => {
          this.bc!.on(
            WORKER_THREADS_SM_MESSAGE,
            this.broadcastHandler.bind(this),
          )
        })
      }

      this.application.registry.hooks.add(Hook.AfterStop, () =>
        this.bc!.close(),
      )
    }
  }

  async publish(key: string, payload: any) {
    if (!isMainThread) {
      this.bc!.postMessage({
        type: WORKER_THREADS_SM_MESSAGE,
        payload: {
          key,
          payload,
        },
      })
    }
    super.publish(key, payload)
  }

  private broadcastHandler({ key, payload }) {
    this.logger.debug(payload, `Received event [${key}]`)
    this.emit(key, payload)
  }
}
