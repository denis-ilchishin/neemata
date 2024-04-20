import {
  BaseTransportConnection,
  type Registry,
  type Subscription,
} from '@neematajs/application'
import { MessageType } from './common'
import { sendPayload } from './server'
import type {
  HttpTransportData,
  WebSocket,
  WebsocketsTransportData,
} from './types'

export class HttpTransportConnection extends BaseTransportConnection {
  readonly transport = 'http'

  constructor(
    protected readonly registry: Registry,
    readonly data: HttpTransportData,
    private readonly headers: Headers,
  ) {
    super(registry)
  }

  protected sendEvent(): boolean {
    throw new Error(
      'HTTP transport does not support bi-directional communication',
    )
  }

  setHeader(key: string, value: string) {
    this.headers.set(key, value)
  }
}

export class WebsocketsTransportConnection extends BaseTransportConnection {
  readonly transport = 'websockets'

  #websocket: WebSocket

  constructor(
    protected readonly registry: Registry,
    readonly data: WebsocketsTransportData,
    websocket: WebSocket,
    id: string,
    subscriptions: Map<string, Subscription>,
  ) {
    super(registry, id, subscriptions)
    this.#websocket = websocket
  }

  protected sendEvent(event: string, payload: any) {
    return sendPayload(this.#websocket, MessageType.Event, [event, payload])
  }
}
