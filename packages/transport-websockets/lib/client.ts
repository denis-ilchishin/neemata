import { BaseTransportClient } from '@neemata/application'
import { MessageType } from './common'
import { sendPayload } from './server'
import { WebSocket } from './types'

export class WebsocketsTransportClient extends BaseTransportClient {
  readonly protocol = 'websockets'

  #websocket: WebSocket

  constructor(id: string, data: any, websocket: WebSocket) {
    super(id, data, 'websockets')
    this.#websocket = websocket
  }

  _handle(event: string, payload: any) {
    return sendPayload(this.#websocket, MessageType.Event, [event, payload])
  }
}
