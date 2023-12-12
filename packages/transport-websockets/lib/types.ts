import uws from 'uWebSockets.js'

import { Container } from '@neemata/application'
import {
  HttpTransportOptions,
  HttpTransportProtocol,
} from '@neemata/transport-http'
import { Readable } from 'node:stream'

export type WebSocketUserData = {
  id: string
  streams: Map<number, Readable>
  container: Container
  context: WebsocketsTransportClientContext
}

export type WebSocket = uws.WebSocket<WebSocketUserData>

export type WebsocketsTransportOptions<ClientData> =
  HttpTransportOptions<ClientData> & {
    http?: boolean
  }

export type WebsocketsTransportData = {
  headers: Record<string, string>
  query: any
  proxyRemoteAddress: string
  remoteAddress: string
  protocol: HttpTransportProtocol
}

export type WebsocketsTransportClientContext = {
  id: string
  websocket: WebSocket
} & WebsocketsTransportData

export type WebsocketsTransportProcedureOptions = {}
export type WebsocketsTransportApplicationContext = {}

export const MessageType = Object.freeze({
  Rpc: 1,
  StreamTerminate: 2,
  StreamPush: 3,
  StreamPull: 4,
  StreamEnd: 5,
  Event: 6,
})
export type MessageType = (typeof MessageType)[keyof typeof MessageType]
