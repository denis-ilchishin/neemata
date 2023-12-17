import {
  ApiError,
  ExtensionInstallOptions,
  Scope,
  Stream,
} from '@neemata/application'
import {
  STREAM_SERIALIZE_KEY,
  concat,
  decodeNumber,
  decodeText,
  encodeNumber,
  encodeText,
} from '@neemata/common'
import {
  HttpTransportClient,
  HttpTransportProtocol,
  HttpTransportServer,
  InternalError,
  Req,
  Res,
} from '@neemata/transport-http'
import { randomUUID } from 'node:crypto'
import { PassThrough, Readable } from 'node:stream'
import { WebsocketsTransportClient } from './client'
import { MessageType } from './common'
import {
  WebSocket,
  WebSocketUserData,
  WebsocketsTransportApplicationContext,
  WebsocketsTransportClientContext,
  WebsocketsTransportData,
  WebsocketsTransportOptions,
  WebsocketsTransportProcedureOptions,
} from './types'

export class WebsocketsTransportServer extends HttpTransportServer {
  sockets = new Set<WebSocket>()
  clients = new Map<string, WebsocketsTransportClient | HttpTransportClient>()

  constructor(
    protected readonly options: WebsocketsTransportOptions<any>,
    protected readonly application: ExtensionInstallOptions<
      WebsocketsTransportProcedureOptions,
      WebsocketsTransportApplicationContext
    >
  ) {
    super(options, application)
  }

  protected bindHandlers(): void {
    if (this.options.http) super.bindHandlers()

    this.server.ws(this.basePath('api'), {
      maxPayloadLength: this.options.maxPayloadLength,
      sendPingsAutomatically: true,
      upgrade: async (res, req, socket) => {
        if (!socket) return void res.close()
        let isAborted = false
        res.onAborted(() => (isAborted = true))
        const { headers, proxyRemoteAddress, query, remoteAddress } =
          this.getRequestData(req, res)

        const streams = {
          client: new Map(),
          server: new Map(),
          streamId: 0,
        }
        const transportData: WebsocketsTransportData = {
          headers,
          query,
          proxyRemoteAddress,
          remoteAddress,
          protocol: HttpTransportProtocol.Websockets,
        }
        const context: Omit<WebsocketsTransportClientContext, 'websocket'> = {
          id: randomUUID(),
          ...transportData,
        }

        const container = this.container.createScope(Scope.Connection)

        const wsData: WebSocketUserData = {
          id: randomUUID(),
          streams,
          container,
          context,
        }

        try {
          if (isAborted) throw new Error('Aborted')
          res.cork(() => {
            res.upgrade(
              wsData,
              headers['sec-websocket-key'],
              headers['sec-websocket-protocol'],
              headers['sec-websocket-extensions'],
              socket
            )
          })
        } catch (error) {
          res.close()
          this.handleDispose(container)
        }
      },
      open: async (ws: WebSocket) => {
        this.sockets.add(ws)
        const { id, context } = ws.getUserData()
        this.logger.trace('Open new websocket [%s]', id)
        try {
          const clientData = await this.getClientData(context)
          const client = new WebsocketsTransportClient(id, clientData, ws)
          this.clients.set(id, client)
        } catch (error) {
          ws.close()
        }
      },
      message: (ws, message, isBinary) => {
        if (!isBinary) return void ws.close()
        try {
          const type = decodeNumber(message, 'Uint8')
          const messageBuffer = message.slice(Uint8Array.BYTES_PER_ELEMENT)
          this[type]?.(ws, messageBuffer)
        } catch (error) {
          this.logger.error(error)
        }
      },
      close: async (ws, code, message) => {
        const { id, container, streams } = ws.getUserData()
        this.sockets.delete(ws)
        this.clients.delete(id)
        streams.client.forEach((stream) => stream.destroy())
        streams.server.forEach(({ response: stream }) => stream.destroy())
        streams.client.clear()
        streams.server.clear()
        this.handleDispose(container)
      },
    })
  }

  protected async [MessageType.Rpc](ws: WebSocket, payloadBuf: ArrayBuffer) {
    // TODO: refactor this mess

    const data = ws.getUserData()
    const client = this.clients.get(data.id)
    const streamDataLength = decodeNumber(payloadBuf, 'Uint32')

    const streams = fromJSON(
      decodeText(
        payloadBuf.slice(
          Uint32Array.BYTES_PER_ELEMENT,
          Uint32Array.BYTES_PER_ELEMENT + streamDataLength
        )
      )
    )

    for (const [id, metadata] of streams) {
      const read = (size) => {
        send(
          ws,
          MessageType.ClientStreamPull,
          encodeNumber(id, 'Uint32'),
          size ? encodeNumber(size, 'Uint32') : null
        )
      }
      const stream = new Stream(
        id,
        metadata,
        read,
        this.options.maxStreamChunkLength
      )
      data.streams.client.set(id, stream)
      stream.on('error', (cause) =>
        this.logger.trace(new Error('Stream error', { cause }))
      )
    }

    const streamsReplacer = (key, value) => {
      if (typeof value === 'string' && value.startsWith(STREAM_SERIALIZE_KEY)) {
        return data.streams.client.get(
          parseInt(value.slice(STREAM_SERIALIZE_KEY.length))
        )
      }
      return value
    }

    const rpcPayload = fromJSON(
      decodeText(
        payloadBuf.slice(Uint32Array.BYTES_PER_ELEMENT + streamDataLength)
      ),
      streamsReplacer
    )

    const [callId, procedure, payload] = rpcPayload
    const container = data.container.createScope(Scope.Call)
    try {
      const response = await this.handleRPC(
        client,
        procedure,
        container,
        payload
      )
      sendPayload(ws, MessageType.Rpc, [callId, response, null])
    } catch (error) {
      if (error instanceof ApiError) {
        sendPayload(ws, MessageType.Rpc, [callId, null, error])
      } else {
        this.logger.error(new Error('Unexpected error', { cause: error }))
        sendPayload(ws, MessageType.Rpc, [callId, null, InternalError()])
      }
    } finally {
      this.handleDispose(container)
    }
  }

  async [MessageType.ClientStreamPush](ws: WebSocket, buffer: ArrayBuffer) {
    const { streams } = ws.getUserData()
    const id = decodeNumber(buffer, 'Uint32')
    const stream = streams.client.get(id)
    if (!stream) return void ws.close()
    else stream.push(Buffer.from(buffer.slice(Uint32Array.BYTES_PER_ELEMENT)))
  }

  async [MessageType.ClientStreamEnd](ws: WebSocket, buffer: ArrayBuffer) {
    const { streams } = ws.getUserData()
    const id = decodeNumber(buffer, 'Uint32')
    const stream = streams.client.get(id)
    if (!stream) return void ws.close()
    stream.once('finish', () =>
      send(ws, MessageType.ClientStreamEnd, encodeNumber(id, 'Uint32'))
    )
    stream.push(null)
    streams.client.delete(id)
  }

  async [MessageType.ClientStreamAbort](ws: WebSocket, buffer: ArrayBuffer) {
    const { streams } = ws.getUserData()
    const id = decodeNumber(buffer, 'Uint32')
    const stream = streams.client.get(id)
    if (!stream) ws.close()
    stream.destroy(new Error('Aborted by client'))
  }
}

export const toJSON = (
  data: any,
  replacer?: (key: string, value: any) => any
) => (data ? JSON.stringify(data, replacer) : undefined)

export const fromJSON = (
  data: any,
  replacer?: (key: string, value: any) => any
) => (data ? JSON.parse(data, replacer) : undefined)

export const getBody = (req: Req, res: Res) => {
  const toBuffer = () => {
    const chunks: Buffer[] = []
    return new Promise<Buffer>((resolve, reject) => {
      res.onData((chunk, isLast) => {
        chunks.push(Buffer.from(chunk))
        if (isLast) resolve(Buffer.concat(chunks))
      })
      res.onAborted(() => reject(new Error('Aborted')))
    })
  }

  const toString = async () => {
    const buffer = await toBuffer()
    return buffer.toString()
  }

  const toJSON = async () => {
    const buffer = await toBuffer()
    if (buffer.byteLength) return fromJSON(buffer)
    return null
  }

  const toStream = (): Readable => {
    const stream = new PassThrough()
    res.onData((chunk, isLast) => {
      stream.write(Buffer.from(chunk))
      if (isLast) stream.end()
    })
    res.onAborted(() => stream.destroy())
    return stream
  }

  return { toBuffer, toString, toJSON, toStream }
}

const CLOSED_SOCKET_MESSAGE =
  'Invalid access of closed uWS.WebSocket/SSLWebSocket.'

export const sendPayload = (ws: WebSocket, type: number, payload: any) => {
  return send(ws, type, encodeText(toJSON(payload)))
}

const send = (ws: WebSocket, type: number, ...buffers: ArrayBuffer[]) => {
  try {
    const result = ws.send(
      concat(encodeNumber(type, 'Uint8'), ...buffers.filter(Boolean)),
      true
    )
    return result === 0 || result === 1
  } catch (error: any) {
    if (error.message !== CLOSED_SOCKET_MESSAGE) throw error
    return false
  }
}
