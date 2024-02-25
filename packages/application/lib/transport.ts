import { randomUUID } from 'node:crypto'

import { Event } from './events'
import { BaseExtension } from './extension'
import { Subscription } from './subscription'
import { Extra } from './types'

export interface BaseTransportData {
  transport: string
}
export abstract class BaseTransport<
  Context extends Extra = {},
  Connection extends BaseTransportConnection = BaseTransportConnection,
> extends BaseExtension<Context, { connection: Connection }> {
  abstract start(): any
  abstract stop(): any

  addConnection(connection: BaseTransportConnection) {
    this.application.connections.set(connection.id, connection)
  }

  removeConnection(
    connectionOrId: BaseTransportConnection | BaseTransportConnection['id'],
  ) {
    const connection =
      connectionOrId instanceof BaseTransportConnection
        ? connectionOrId
        : this.application.connections.get(connectionOrId)
    if (connection) {
      this.application.connections.delete(connection.id)
    }
  }

  hasConnection(connection: BaseTransportConnection) {
    return this.application.connections.has(connection.id)
  }

  getConnection(id: BaseTransportConnection['id']) {
    return this.application.connections.get(id)
  }
}

export abstract class BaseTransportConnection {
  abstract readonly transport: string
  abstract readonly data: any

  constructor(
    readonly id: string = randomUUID(),
    readonly subscriptions = new Map<string, Subscription>(),
  ) {}

  send<E extends Event>(event: E, payload: E['_']['payload']) {
    return this.sendEvent(event.name, payload)
  }

  protected abstract sendEvent(eventName: string, payload: any): boolean
}
