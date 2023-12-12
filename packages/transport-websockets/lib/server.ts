import { ApiError, ExtensionInstallOptions, Scope } from '@neemata/application'
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
import {
  MessageType,
  concat,
  decodeNumber,
  decodeText,
  encodeNumber,
  encodeText,
} from './common'
import {
  WebSocket,
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

        const streams = new Map()
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

        const wsData = {
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
        const { id, context, container } = ws.getUserData()
        this.logger.trace('Open new websocket [%s]', id)
        try {
          const clientData = await this.getClientData(
            container,
            context,
            Scope.Connection
          )
          const client = new WebsocketsTransportClient(context, ws, clientData)
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
        this.handleDispose(container)
      },
    })
  }

  protected async [MessageType.Rpc](ws: WebSocket, payloadBuf: ArrayBuffer) {
    const data = ws.getUserData()
    const client = this.clients.get(data.id)
    const streamDataLength = decodeNumber(payloadBuf, 'Uint32')
    const rpcPayload = fromJSON(
      decodeText(
        payloadBuf.slice(Uint32Array.BYTES_PER_ELEMENT + streamDataLength)
      )
    )
    const msgType = MessageType.Rpc
    const [callId, procedure, payload] = rpcPayload
    const container = data.container.createScope(Scope.Call)
    try {
      const response = await this.handleRPC(
        client,
        procedure,
        container,
        payload
      )
      sendPayload(ws, msgType, [callId, { response }])
    } catch (error) {
      if (error instanceof ApiError) {
        sendPayload(ws, msgType, [callId, { error }])
      } else {
        this.logger.error(new Error('Unexpected error', { cause: error }))
        sendPayload(ws, msgType, [callId, { error: InternalError() }])
      }
    } finally {
      this.handleDispose(container)
    }
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

/*
export class WsTransport {
  constructor(private readonly transport: Server) {}

  get logger() {
    return this.transport.logger
  }

  bind() {
    this.transport.httpServer.ws(this.transport.basePath('api'), {
      maxPayloadLength: this.transport.options.maxPayloadLength,
      sendPingsAutomatically: true,
      upgrade: async (res, req, socket) => {
        if (!socket) return void res.close()
        let isAborted = false
        res.onAborted(() => (isAborted = true))

        const headers = getRequestHeaders(req)
        const proxyRemoteAddress = decodeText(
          res.getProxiedRemoteAddressAsText()
        )
        const remoteAddress = decodeText(res.getRemoteAddressAsText())
        const query = qs.parse(req.getQuery(), this.transport.options.qsOptions)

        const secKey = headers['sec-websocket-key']
        const secProtocol = headers['sec-websocket-protocol']
        const secExtensions = headers['sec-websocket-extensions']

        const streams = new Map()

        const context: TransportConnectionContext = {
          headers,
          query,
          proxyRemoteAddress,
          remoteAddress,
          transport: Transport.Ws,
        }
        const container = this.transport.application.container.createScope(
          Scope.Connection,
          {
            request: context,
          }
        )
        const wsData = {
          id: randomUUID(),
          streams,
          container,
          context,
        }
        try {
          if (isAborted) throw new Error('Aborted')
          res.cork(() => {
            res.upgrade(wsData, secKey, secProtocol, secExtensions, socket)
          })
        } catch (error) {
          res.close()
          await container.dispose()
        }
      },
      open: (ws: WebSocket) => {
        this.transport.sockets.add(ws)
        const { id, context } = ws.getUserData()
        this.logger.trace('Open new websocket [%s]', id)
        const websocket = new TransportWebSocket(id, ws, this.transport.rooms)
        this.transport.websockets.set(id, websocket)
        this.transport.application.callHook(
          TransportHook.Connection,
          context,
          websocket
        )
      },
      message: (ws, message, isBinary) => {
        if (!isBinary) return void ws.close()
        const { id } = ws.getUserData()
        try {
          const type = decodeNumber(message, 'Uint8')
          const messageBuffer = message.slice(Uint8Array.BYTES_PER_ELEMENT)
          this.logger.trace(
            'Received websocket [%s] message [%s] typeof [%s]',
            id,
            type
          )
          this[type]?.(ws, messageBuffer)
        } catch (error) {
          this.logger.error(error)
        }
      },
      subscription: (socket, roomIdBuff, newCount, oldCount) => {
        //TODO: refactor this mess
        const { id } = socket.getUserData()
        const ws = this.transport.websockets.get(id)
        const roomId = decodeText(roomIdBuff)
        const unsubscribed = newCount < oldCount

        this.logger.debug(
          '%s websocket [%s] %s room [%s]',
          unsubscribed ? 'Unsubscribe' : 'Subscribe',
          id,
          unsubscribed ? 'from' : 'to',
          roomId
        )

        let room: Room = this.transport.rooms.get(roomId)

        if (!room) {
          room = {
            id: roomId,
            websockets: new Set(),
            publish: (
              event: string,
              data: any,
              exclude?: WebSocketInterface
            ) => {
              for (const ws of room.websockets) {
                if (!exclude || exclude.id !== ws.id) {
                  ws.send(event, data)
                }
              }
            },
          }
        }

        if (newCount === 0) {
          room.websockets.clear()
          this.transport.rooms.delete(roomId)
        } else {
          if (unsubscribed) room.websockets.delete(ws)
          else room.websockets.add(ws)

          if (!this.transport.rooms.has(roomId))
            this.transport.rooms.set(roomId, room)
        }
      },
      close: async (ws, code, message) => {
        this.transport.sockets.delete(ws)
        const { id, container, streams } = ws.getUserData()
        this.logger.trace(
          'Close websocket [%s] with message [%s]',
          id,
          decodeText(message)
        )
        this.transport.websockets.delete(id)
        this.transport.handleDisposal(container)
        for (const stream of streams.values())
          stream.destroy(new Error('Client is closed'))
        streams.clear()
      },
    })
  }

  async [MessageType.Rpc](ws: WebSocket, payloadBuf: ArrayBuffer) {
    //TODO: refactor this mess

    const data = ws.getUserData()
    const streamDataLength = decodeNumber(payloadBuf, 'Uint32')

    const streamsData = fromJSON(
      decodeText(
        payloadBuf.slice(
          Uint32Array.BYTES_PER_ELEMENT,
          Uint32Array.BYTES_PER_ELEMENT + streamDataLength
        )
      )
    )

    for (const _stream of streamsData) {
      const { id, ...meta } = _stream
      const stream = new Stream(
        ws,
        id,
        meta,
        this.transport.options.maxStreamChunkLength
      )
      stream.on('error', (cause) =>
        this.logger.trace(new Error('Stream error', { cause }))
      )
      data.streams.set(id, stream)
    }

    const streamsReplacer = (key, value) => {
      if (typeof value === 'string' && value.startsWith(STREAM_ID_PREFIX)) {
        return data.streams.get(parseInt(value.slice(STREAM_ID_PREFIX.length)))
      }
      return value
    }

    const rpcPayload = fromJSON(
      decodeText(
        payloadBuf.slice(Uint32Array.BYTES_PER_ELEMENT + streamDataLength)
      ),
      streamsReplacer
    )

    const msgType = MessageType.Rpc

    const { procedure, payload, callId } = rpcPayload
    const context: TransportCallContext = merge(data.context, {
      procedure,
      websocket: this.transport.websockets.get(data.id),
    })
    const container = data.container.createScope(Scope.Call, {
      request: context,
    })

    try {
      const response = await this.transport.handleRPC(
        procedure,
        container,
        payload,
        context
      )
      sendPayload(ws, msgType, { callId, payload: { response } })
    } catch (error) {
      if (error instanceof ApiError) {
        sendPayload(ws, msgType, { callId, payload: { error } })
      } else {
        this.logger.error(new Error('Unexpected error', { cause: error }))
        sendPayload(ws, msgType, {
          callId,
          payload: { error: InternalError() },
        })
      }
    } finally {
      this.transport.handleDisposal(container)
    }
  }

  async [MessageType.StreamPush](ws: WebSocket, buffer: ArrayBuffer) {
    const { streams } = ws.getUserData()
    const id = decodeNumber(buffer, 'Uint16')
    const stream = streams.get(id)
    if (!stream) ws.close()
    stream.push(Buffer.from(buffer.slice(Uint16Array.BYTES_PER_ELEMENT)))
  }

  async [MessageType.StreamEnd](ws: WebSocket, buffer: ArrayBuffer) {
    const { streams } = ws.getUserData()
    const id = decodeNumber(buffer, 'Uint16')
    const stream = streams.get(id)
    if (!stream) return void ws.close()
    stream.push(null)
    streams.delete(id)
  }

  async [MessageType.StreamTerminate](ws: WebSocket, buffer: ArrayBuffer) {
    const { streams } = ws.getUserData()
    const id = decodeNumber(buffer, 'Uint16')
    const stream = streams.get(id)
    if (!stream) ws.close()
    stream.destroy(new Error('Terminated by client'))
  }
}

export class Stream extends Readable {
  bytesReceived = 0

  constructor(
    private readonly ws: WebSocket,
    public readonly id: number,
    public readonly meta: StreamMeta,
    highWaterMark?: number
  ) {
    super({ highWaterMark })
    this.once('error', () => {
      send(ws, MessageType.StreamTerminate, encodeNumber(id, 'Uint16'))
    })
  }

  _read(size: number): void {
    send(
      this.ws,
      MessageType.StreamPull,
      encodeNumber(this.id, 'Uint16'),
      size ? encodeNumber(size, 'Uint32') : null
    )
  }

  push(chunk?: Buffer) {
    if (chunk !== null) this.bytesReceived += chunk.byteLength
    return super.push(chunk)
  }
}

class TransportWebSocket implements WebSocketInterface {
  #rooms: Map<string, Room>
  #ws: WebSocket

  constructor(
    public readonly id: string,
    ws: WebSocket,
    rooms: Map<string, Room>
  ) {
    this.#rooms = rooms
    this.#ws = ws
  }

  send(event: string, data?: any) {
    sendPayload(this.#ws, MessageType.Event, { event, data })
  }

  get rooms() {
    const wsRooms = new Map<string, Room>()
    for (const roomId of this.#ws.getTopics()) {
      const room = this.#rooms.get(roomId)
      if (room) wsRooms.set(roomId, room)
    }
    return wsRooms
  }

  join(roomId: string) {
    return this.#ws.subscribe(roomId)
  }

  leave(roomId: string) {
    return this.#ws.unsubscribe(roomId)
  }
}

 */
