import { BaseClient } from '@neemata/application'
import { HttpTransportProtocol } from '@neemata/transport-http'
import { MessageType } from './common'
import { sendPayload } from './server'
import { WebSocket } from './types'

export class WebsocketsTransportClient<Data = any> implements BaseClient<Data> {
  readonly protocol: HttpTransportProtocol = HttpTransportProtocol.Websockets

  #websocket: WebSocket

  constructor(readonly id: string, readonly data: Data, websocket: WebSocket) {
    this.#websocket = websocket
  }

  send(event: string, payload: any) {
    return sendPayload(this.#websocket, MessageType.Event, [event, payload])
  }
}
