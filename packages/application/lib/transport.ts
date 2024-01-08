import { randomUUID } from 'node:crypto'

import { BaseExtension } from '..'
import { Event } from './events'
import { Extra } from './types'

export interface BaseTransportData {
  transport: string
}
export abstract class BaseTransport<
  ProcedureOptions extends Extra = {},
  Context extends Extra = {},
  TransportData extends BaseTransportData = any
> extends BaseExtension<
  ProcedureOptions,
  Context,
  { transportData: TransportData }
> {
  abstract start(): any
  abstract stop(): any

  addConnection(connection: BaseTransportConnection) {
    this.application.connections.set(connection.id, connection)
  }

  removeConnection(
    connection: BaseTransportConnection | BaseTransportConnection['id']
  ) {
    this.application.connections.delete(
      connection instanceof BaseTransportConnection ? connection.id : connection
    )
  }

  hasConnection(connection: BaseTransportConnection) {
    return this.application.connections.has(connection.id)
  }

  getConnection(id: BaseTransportConnection['id']) {
    return this.application.connections.get(id)
  }
}

export abstract class BaseTransportConnection<
  Data = unknown,
  TransportData = unknown,
  Events extends Record<string, Event> = {}
> {
  constructor(
    readonly transportData: TransportData,
    readonly data: Data,
    readonly id: string = randomUUID()
  ) {}

  abstract send<E extends keyof Events>(
    eventName: E,
    payload: Events[E]['payload']
  ): boolean
}
