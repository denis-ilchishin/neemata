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
        this.application.registry.registerHook(Hook.BeforeStart, () => {
          this.bc!.on(
            WORKER_THREADS_SM_MESSAGE,
            this.broadcastHandler.bind(this),
          )
        })
      }

      this.application.registry.registerHook(Hook.AfterStop, () =>
        this.bc!.close(),
      )
    }
  }

  async publish(event: Event, key: string, payload: any) {
    if (!isMainThread) {
      this.bc!.postMessage({
        type: WORKER_THREADS_SM_MESSAGE,
        payload: {
          eventName: event.name,
          key,
          payload,
        },
      })
    }
    super.publish(event, key, payload)
  }

  private broadcastHandler({ eventName, key, payload }) {
    this.logger.debug(payload, `Received event [${eventName}] from [${key}]`)
    this.emit(eventName, key, payload)
  }
}
