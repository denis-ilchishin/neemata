import { PassThrough } from 'node:stream'
import type { Event } from './events'
import { BaseExtension } from './extension'
import { WorkerType } from './types'

export class Subscription<E extends Event = Event> extends PassThrough {
  readonly _!: {
    event: E
  }

  constructor(
    private readonly event: E,
    readonly key: string,
    readonly unsubscribe: () => Promise<any>,
  ) {
    super({ writableObjectMode: true, readableObjectMode: true })
    this.once('unsubscribe', () => this.end())
  }
}

export abstract class BaseSubscriptionManager extends BaseExtension {
  abstract subscribe(subscription: Subscription): any
  abstract unsubscribe(subscription: Subscription): any
  abstract publish(event: Event, key: string, payload: any): any
}

export class BasicSubscriptionManager extends BaseSubscriptionManager {
  name = 'Basic subscription manager'

  protected readonly subscriptions = new Map<string, Set<Subscription>>()

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

  async publish(event: Event, key: string, payload: any) {
    if (this.isApiWorker) this.emit(event.name, key, payload)
  }

  protected emit(eventName: string, key: string, payload: any) {
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
