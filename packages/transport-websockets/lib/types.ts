import {
  BaseTransportConnection,
  Container,
  Stream,
  Subscription,
} from '@neematajs/application'
import { Readable } from 'node:stream'
import uws, { AppOptions, HttpRequest, HttpResponse } from 'uWebSockets.js'
import { HttpTransportMethod } from './common'

export type HttpTransportOptions = {
  port?: number
  hostname?: string
  ssl?: AppOptions
  maxPayloadLength?: number
  maxStreamChunkLength?: number
}

export type HttpTransportProcedureOptions = {
  allowHttp: HttpTransportMethod
}

export type HttpTransportData = {
  transport: 'http'
  headers: Record<string, string>
  query: URLSearchParams
  proxyRemoteAddress: string
  remoteAddress: string
  method: HttpTransportMethod
}

export type HttpTransportApplicationContext = {}

export type Headers = Record<string, string>
export type Req = HttpRequest
export type Res = HttpResponse

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
  subscriptions: Map<string, Subscription>
  container: Container
  connectionData: any
  transportData: any
}

export type WebSocket = uws.WebSocket<WebSocketUserData>

export type WebsocketsTransportOptions = HttpTransportOptions

export type WebsocketsTransportData = {
  transport: 'websockets'
  headers: Record<string, string>
  query: URLSearchParams
  proxyRemoteAddress: string
  remoteAddress: string
}

export type WebsocketsTransportProcedureOptions = {}
export type WebsocketsTransportApplicationContext = {}
