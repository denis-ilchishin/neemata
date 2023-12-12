import { BaseClient } from '@neemata/application'
import { HttpTransportProtocol } from '@neemata/transport-http'
import { sendPayload } from './server'
import {
  MessageType,
  WebSocket,
  WebsocketsTransportClientContext,
} from './types'

export class WebsocketsTransportClient<Data = any> implements BaseClient<Data> {
  readonly id: string
  readonly protocol = HttpTransportProtocol.Websockets

  #context: WebsocketsTransportClientContext
  #websocket: WebSocket

  constructor(
    context: WebsocketsTransportClientContext,
    websocket: WebSocket,
    public readonly data: Data
  ) {
    this.#context = context
    this.#websocket = websocket
    this.id = context.id
  }

  send(event: string, payload: any) {
    return sendPayload(this.#websocket, MessageType.Event, { event, payload })
  }
}
