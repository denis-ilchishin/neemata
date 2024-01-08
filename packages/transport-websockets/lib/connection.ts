import { BaseTransportConnection } from '@neemata/application'
import { MessageType } from './common'
import { sendPayload } from './server'
import { WebSocket } from './types'

export class WebsocketsTransportConnection extends BaseTransportConnection {
  #websocket: WebSocket

  constructor(transportData: any, data: any, websocket: WebSocket, id: string) {
    super(transportData, data, id)
    this.#websocket = websocket
  }

  send(event: string, payload: any) {
    return sendPayload(this.#websocket, MessageType.Event, [event, payload])
  }
}
