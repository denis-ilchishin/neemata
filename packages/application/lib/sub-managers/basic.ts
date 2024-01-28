import { isMainThread } from 'node:worker_threads'
import { Event } from '../events'
import { BaseSubscriptionManager, Subscription } from '../subscription'
import { Hook, WorkerType } from '../types'
import { createBroadcastChannel } from '../utils/threads'

export const WORKER_THREADS_SM_MESSAGE = 'wt_sm_message'
export const WORKER_THREADS_SM_CHANNEL = 'wt_sm_channel'

export class BasicSubscriptionManager extends BaseSubscriptionManager {
  name = 'Basic subscription manager'

  protected readonly subscriptions = new Map<string, Set<Subscription>>()
  protected bc?: ReturnType<typeof createBroadcastChannel>

  subscribe(subscription: Subscription): any {
    let subscriptions = this.subscriptions.get(subscription.key)
    if (!subscriptions) {
      subscriptions = new Set()
      this.subscriptions.set(subscription.key, subscriptions)
    }
    subscriptions.add(subscription)
  }

  unsubscribe(subscription: Subscription): any {
    const subscriptions = this.subscriptions.get(subscription.key)
    if (!subscriptions) return
    subscriptions.delete(subscription)
    if (!subscriptions.size) this.subscriptions.delete(subscription.key)
  }

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
    this.bc?.postMessage({
      type: WORKER_THREADS_SM_MESSAGE,
      payload: {
        eventName: event.name,
        key,
        payload,
      },
    })
    if (this.isApiWorker) this.emit(event.name, key, payload)
  }

  private broadcastHandler({ eventName, key, payload }) {
    this.logger.debug(payload, `Received event [${eventName}] from [${key}]`)
    this.emit(eventName, key, payload)
  }

  private emit(eventName: string, key: string, payload: any) {
    this.logger.debug(payload, `Emitting event [${eventName}] to [${key}]`)
    const subscriptions = this.subscriptions.get(key)
    if (!subscriptions) return
    for (const subscription of subscriptions) {
      subscription.write(payload)
    }
  }

  protected get logger() {
    return this.application.logger
  }

  protected get isApiWorker() {
    return this.application.type === WorkerType.Api
  }
}
