import { PassThrough } from 'node:stream'
import { Event } from './events'
import { BaseExtension } from './extension'

export class Subscription<E extends Event = Event> extends PassThrough {
  readonly _!: {
    event: E
  }

  constructor(
    private readonly event: E,
    readonly key: string,
    readonly unsubscribe: () => Promise<boolean>
  ) {
    super({ writableObjectMode: true, readableObjectMode: true })
    this.once('unsubscribe', () => this.end())
  }
}

export abstract class BaseSubscriptionManager extends BaseExtension {
  abstract subscribe(subscription: Subscription): any
  abstract unsubscribe(subscription: Subscription): Promise<boolean>
  abstract publish(event: Event, key: string, payload: any): Promise<boolean>
}
