export const AdapterHook = Object.freeze({
  Connection: 'Connection',
})
export type AdapterHook = (typeof AdapterHook)[keyof typeof AdapterHook]

export const Transport = Object.freeze({
  Ws: 'Ws',
  Http: 'Http',
})
export type Transport = (typeof Transport)[keyof typeof Transport]

export type HttpMethod = 'get' | 'post'

export type WebSocketInterface = {
  id: string
  join: (roomId: string) => boolean
  leave: (roomId: string) => boolean
  send: (event: string, data?: any) => void
  rooms: Map<string, Room>
}

export type Room = {
  id: string
  websockets: Set<WebSocketInterface>
  publish: (event: string, data: any, exclude?: WebSocketInterface) => void
}

export type AdapterOptions = {
  port?: number
  hostname?: string
  qsOptions?: import('qs').IParseOptions
  https?: import('uWebSockets.js').AppOptions
  maxPayloadLength?: number
  maxStreamChunkLength?: number
}

export type AdapterProcedureOptions = {
  transport?: Transport
}

export type AdapterConnectionContext = {
  headers: Record<string, string>
  query: any
  proxyRemoteAddress: string
  remoteAddress: string
  transport: Transport
}

export type AdapterCallContext = AdapterConnectionContext & {
  procedure: string
  method?: HttpMethod
  websocket?: WebSocketInterface
  setResponseHeader?: (name: string, value: string) => void
}

export type AdapterContext = {
  websockets: Map<string, WebSocketInterface>
  rooms: Map<string, Room>
  request?: AdapterCallContext
}

export type StreamMeta = {
  size: number
  type?: string
  name?: string
}

export type Stream = import('node:stream').Readable & { meta: StreamMeta }

export const MessageType = Object.freeze({
  Rpc: 1,
  StreamTerminate: 2,
  StreamPush: 3,
  StreamPull: 4,
  StreamEnd: 5,
  Event: 6,
})
export type MessageType = (typeof MessageType)[keyof typeof MessageType]

export const STREAM_ID_PREFIX = 'neemata:uws:stream:'
