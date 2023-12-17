import { Container, Stream } from '@neemata/application'
import {
  HttpTransportOptions,
  HttpTransportProtocol,
} from '@neemata/transport-http'
import { Readable } from 'node:stream'
import uws from 'uWebSockets.js'

export type WebSocketUserData = {
  id: string
  streams: {
    /**
     * Client to server streams
     */
    up: Map<number, Stream>
    /**
     * Server to client streams
     */
    down: Map<number, Readable>
    streamId: number
  }
  container: Container
  context: WebsocketsTransportData
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
