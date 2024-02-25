import { Readable } from 'node:stream'
import {
  BaseTransportConnection,
  Container,
  Stream,
  Subscription,
} from '@neematajs/application'
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
  transportData: WebsocketsTransportData
}

export type WebSocket = uws.WebSocket<WebSocketUserData>

export type WebsocketsTransportOptions = HttpTransportOptions & {
  enableHttp?: boolean
}

export type WebsocketsTransportData = {
  transport: 'websockets'
  headers: Record<string, string>
  query: URLSearchParams
  proxyRemoteAddress: string
  remoteAddress: string
}

export type WebsocketsTransportApplicationContext = {}
