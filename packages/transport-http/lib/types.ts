import { ProviderDeclaration } from '@neemata/application'
import { IParseOptions } from 'qs'
import { AppOptions, HttpRequest, HttpResponse } from 'uWebSockets.js'

export enum HttpTransportProtocol {
  Http = 'Http',
  Websockets = 'Websockets',
}

export enum HttpTransportMethod {
  Get = 'get',
  Post = 'post',
}

export type HttpTransportOptions<ClientData> = {
  port?: number
  hostname?: string
  qsOptions?: IParseOptions
  ssl?: AppOptions
  maxPayloadLength?: number
  maxStreamChunkLength?: number
  clientProvider?: ProviderDeclaration<ClientData>
}

export type HttpTransportProcedureOptions = {}

export type HttpTransportData = {
  headers: Record<string, string>
  query: any
  proxyRemoteAddress: string
  remoteAddress: string
  protocol: HttpTransportProtocol
  method: HttpTransportMethod
}

export type HttpTransportClientContext = {
  id: string
  setResponseHeader: (key: string, value: string) => any
} & HttpTransportData

export type HttpTransportApplicationContext = {}

export type Headers = Record<string, string>
export type Req = HttpRequest
export type Res = HttpResponse
