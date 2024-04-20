import { randomUUID } from 'node:crypto'

import type { Event } from './events'
import { BaseExtension } from './extension'
import type { Registry } from './registry'
import type { Subscription } from './subscription'

export interface BaseTransportData {
  transport: string
}

export abstract class BaseTransport<
  Connection extends BaseTransportConnection = BaseTransportConnection,
  Options = unknown,
> extends BaseExtension<Options, { connection: Connection }> {
  abstract start(): any
  abstract stop(): any
}

export abstract class BaseTransportConnection {
  abstract readonly transport: string
  abstract readonly data: any

  constructor(
    protected readonly registry: Registry,
    readonly id: string = randomUUID(),
    readonly subscriptions = new Map<string, Subscription>(),
  ) {}

  send<E extends Event>(event: E, payload: E['_']['payload']) {
    const eventName = this.registry.getName('event', event)
    return this.sendEvent(eventName, payload)
  }

  protected abstract sendEvent(eventName: string, payload: any): boolean
}
