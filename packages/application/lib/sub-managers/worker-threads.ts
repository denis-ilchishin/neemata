import { Event } from '../events'
import { BaseSubscriptionManager, Subscription } from '../subscription'
import { Hook, WorkerType } from '../types'
import { createBroadcastChannel } from '../utils/threads'

export const WORKER_THREADS_SM_MESSAGE = 'wt_sm_message'
export const WORKER_THREADS_SM_CHANNEL = 'wt_sm_channel'

export class WorkerThreadsSubscriptionManager extends BaseSubscriptionManager {
  name = 'WT SubManager'

  protected subscriptions = new Map<string, Set<Subscription>>()
  protected broadcastChannel = createBroadcastChannel(WORKER_THREADS_SM_CHANNEL)

  private get isApiWorker() {
    return this.application.type === WorkerType.Api
  }

  initialize() {
    if (this.isApiWorker) {
      this.application.registerHook(Hook.BeforeStart, () => {
        this.broadcastChannel.emitter.on(
          WORKER_THREADS_SM_MESSAGE,
          this.broadcastHandler.bind(this)
        )
      })
    }

    this.application.registerHook(Hook.AfterStop, () =>
      this.broadcastChannel.close()
    )
  }

  async subscribe(subscription: Subscription) {
    const subscriptions = this.subscriptions.get(subscription.key) || new Set()
    subscriptions.add(subscription)
    this.subscriptions.set(subscription.key, subscriptions)
    return true
  }

  async unsubscribe(subscription: Subscription): Promise<boolean> {
    const subscriptions = this.subscriptions.get(subscription.key)
    if (!subscriptions) return false
    subscriptions.delete(subscription)
    if (!subscriptions.size) this.subscriptions.delete(subscription.key)
    return true
  }

  async publish(event: Event, key: string, payload: any): Promise<boolean> {
    this.broadcastChannel.channel.postMessage({
      type: WORKER_THREADS_SM_MESSAGE,
      payload: {
        eventName: event.name,
        key,
        payload,
      },
    })
    if (this.isApiWorker) this.emit(event.name, key, payload)
    return true
  }

  private broadcastHandler({ eventName, key, payload }) {
    this.logger.debug(payload, `Received event [${eventName}]`)
    this.emit(eventName, key, payload)
  }

  private emit(eventName: string, key: string, payload: any) {
    this.logger.debug(payload, `Emitting event [${eventName}]`)
    const subscriptions = this.subscriptions.get(key)
    if (!subscriptions) return
    for (const subscription of subscriptions) {
      subscription.write(payload)
    }
  }

  private get logger() {
    return this.application.logger
  }
}
