import { randomUUID } from 'node:crypto'

import { Event } from './events'
import { ExtensionInstallOptions, ExtensionInterface, Extra } from './types'

export abstract class BaseTransport<
  ProcedureOptions extends Extra = {},
  Context extends Extra = {},
  Client extends BaseTransportClient = BaseTransportClient,
  TransportData = unknown
> implements ExtensionInterface<ProcedureOptions, Context>
{
  readonly application!: ExtensionInstallOptions<ProcedureOptions, Context>
  readonly _!: {
    options: ProcedureOptions
    context: Context
    client: Client
    transportData: TransportData
  }

  context?(): Context

  abstract name: string
  abstract start(): any
  abstract stop(): any
  abstract initialize?(): any
}

export abstract class BaseTransportClient<
  Data = unknown,
  Events extends Record<string, Event> = {}
> {
  readonly id: string
  readonly protocol: string
  readonly data: Data

  constructor(id: string = randomUUID(), data: any, protocol: string) {
    this.id = id
    this.data = data
    this.protocol = protocol
  }

  send<E extends keyof Events>(
    eventName: E,
    payload: Events[E]['payload']
  ): boolean {
    return this._handle(eventName as string, payload)
  }

  abstract _handle(eventName: string, payload: any): boolean
}
