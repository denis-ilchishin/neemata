import {
  BaseTransportConnection,
  Container,
  Stream,
} from '@neemata/application'
import { HttpTransportOptions } from '@neemata/transport-http'
import { Readable } from 'node:stream'
import uws from 'uWebSockets.js'

export type WebSocketUserData = {
  id: BaseTransportConnection['id']
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
  connectionData: any
  transportData: any
}

export type WebSocket = uws.WebSocket<WebSocketUserData>

export type WebsocketsTransportOptions = HttpTransportOptions

export type WebsocketsTransportData = {
  transport: 'websockets'
  headers: Record<string, string>
  query: any
  proxyRemoteAddress: string
  remoteAddress: string
}

export type WebsocketsTransportProcedureOptions = {}
export type WebsocketsTransportApplicationContext = {}
