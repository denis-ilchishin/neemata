import { IParseOptions } from 'qs'
import { AppOptions, HttpRequest, HttpResponse } from 'uWebSockets.js'

export enum HttpTransportMethod {
  Get = 'get',
  Post = 'post',
}

export type HttpTransportOptions = {
  port?: number
  hostname?: string
  qsOptions?: IParseOptions
  ssl?: AppOptions
  maxPayloadLength?: number
  maxStreamChunkLength?: number
}

export type HttpTransportProcedureOptions = {}

export type HttpTransportData = {
  transport: 'http'
  headers: Record<string, string>
  query: any
  proxyRemoteAddress: string
  remoteAddress: string
  method: HttpTransportMethod
}

export type HttpTransportApplicationContext = {}

export type Headers = Record<string, string>
export type Req = HttpRequest
export type Res = HttpResponse
