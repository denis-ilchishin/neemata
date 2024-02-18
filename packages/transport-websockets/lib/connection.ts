import { BaseTransportConnection } from '@neematajs/application'
import { MessageType } from './common'
import { sendPayload } from './server'
import { HttpTransportData, WebSocket } from './types'

export class HttpTransportConnection extends BaseTransportConnection {
  constructor(
    data: any,
    private readonly headers: Headers,
  ) {
    super(data)
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
  #websocket: WebSocket

  constructor(data: any, websocket: WebSocket, id: string) {
    super(data, id)
    this.#websocket = websocket
  }

  protected sendEvent(event: string, payload: any) {
    return sendPayload(this.#websocket, MessageType.Event, [event, payload])
  }
}
