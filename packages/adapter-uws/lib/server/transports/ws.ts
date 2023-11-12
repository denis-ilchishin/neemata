import { ApiError, Scope } from '@neemata/application'
import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import qs from 'qs'
import {
  AdapterCallContext,
  AdapterConnectionContext,
  AdapterHook,
  MessageType,
  Room,
  STREAM_ID_PREFIX,
  StreamMeta,
  Transport,
  WebSocketInterface,
} from '../../types'
import {
  concat,
  decodeNumber,
  decodeText,
  encodeNumber,
  encodeText,
} from '../../utils'
import {
  InternalError,
  Server,
  WebSocket,
  fromJSON,
  getRequestHeaders,
  toJSON,
} from '../index'

const CLOSED_SOCKET_MESSAGE =
  'Invalid access of closed uWS.WebSocket/SSLWebSocket.'

const sendPayload = (ws: WebSocket, type: number, payload: any) => {
  send(ws, type, encodeText(toJSON(payload)))
}

const send = (ws: WebSocket, type: number, ...buffers: ArrayBuffer[]) => {
  try {
    ws.send(
      concat(encodeNumber(type, 'Uint8'), ...buffers.filter(Boolean)),
      true
    )
  } catch (error) {
    if (error.message !== CLOSED_SOCKET_MESSAGE) throw error
  }
}

export class WsTransport {
  constructor(private readonly adapter: Server) {}

  get logger() {
    return this.adapter.logger
  }

  bind() {
    this.adapter.httpAdapter.ws(this.adapter.basePath('api'), {
      maxPayloadLength: this.adapter.options.maxPayloadLength,
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
        const query = qs.parse(req.getQuery(), this.adapter.options.qsOptions)

        const secKey = headers['sec-websocket-key']
        const secProtocol = headers['sec-websocket-protocol']
        const secExtensions = headers['sec-websocket-extensions']

        const streams = new Map()

        const context: AdapterConnectionContext = {
          headers,
          query,
          proxyRemoteAddress,
          remoteAddress,
          transport: Transport.Ws,
        }
        const container = this.adapter.application.container.copy(
          Scope.Connection,
          {
            request: context,
          }
        )
        const wsData = {
          id: randomUUID(),
          streams,
          container: container,
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
        const { id, context } = ws.getUserData()
        this.logger.trace('Open new websocket [%s]', id)
        const websocket = new AdapterWebSocket(id, ws, this.adapter.rooms)
        this.adapter.websockets.set(id, websocket)
        this.adapter.application.fireHook(
          AdapterHook.Connection,
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
        const ws = this.adapter.websockets.get(id)
        const roomId = decodeText(roomIdBuff)
        const unsubscribed = newCount < oldCount

        this.logger.debug(
          '%s websocket [%s] %s room [%s]',
          unsubscribed ? 'Unsubscribe' : 'Subscribe',
          id,
          unsubscribed ? 'from' : 'to',
          roomId
        )

        let room: Room = this.adapter.rooms.get(roomId)

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
          this.adapter.rooms.delete(roomId)
        } else {
          if (unsubscribed) room.websockets.delete(ws)
          else room.websockets.add(ws)

          if (!this.adapter.rooms.has(roomId))
            this.adapter.rooms.set(roomId, room)
        }
      },
      close: async (ws, code, message) => {
        const { id, container, streams } = ws.getUserData()
        this.logger.trace(
          'Close websocket [%s] with message [%s]',
          id,
          decodeText(message)
        )
        this.adapter.websockets.delete(id)
        this.adapter.handleDisposal(container)
        for (const stream of streams.values())
          stream.destroy(new Error('Client is closed'))
        streams.clear()
      },
    })
  }

  async [MessageType.Rpc](ws: WebSocket, payloadBuf: ArrayBuffer) {
    //TODO: refactor this mess

    const { streams } = ws.getUserData()
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
        this.adapter.options.maxStreamChunkLength
      )
      stream.once('error', (error) => {
        this.logger.trace('Stream [%s] error: [%s]', id, error.message)
        send(ws, MessageType.StreamTerminate, encodeNumber(id, 'Uint16'))
      })
      streams.set(id, stream)
    }

    const streamsReplacer = (key, value) => {
      if (typeof value === 'string' && value.startsWith(STREAM_ID_PREFIX)) {
        return streams.get(parseInt(value.slice(STREAM_ID_PREFIX.length)))
      }
      return value
    }

    const rpcPayload = fromJSON(
      decodeText(
        payloadBuf.slice(Uint32Array.BYTES_PER_ELEMENT + streamDataLength)
      ),
      streamsReplacer
    )

    const type = MessageType.Rpc
    const data = ws.getUserData()
    const { procedure, payload, callId } = rpcPayload
    const context: AdapterCallContext = {
      ...data.context,
      procedure,
      websocket: this.adapter.websockets.get(data.id),
    }
    const container = data.container.copy(Scope.Call, { request: context })

    try {
      const response = await this.adapter.handleRPC(
        procedure,
        container,
        payload,
        context
      )
      sendPayload(ws, type, { callId, payload: { response } })
    } catch (error) {
      if (error instanceof ApiError) {
        sendPayload(ws, type, { callId, payload: { error } })
      } else {
        this.logger.error(new Error('Unexpected error', { cause: error }))
        sendPayload(ws, type, { callId, payload: { error: InternalError() } })
      }
    } finally {
      this.adapter.handleDisposal(container)
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

class AdapterWebSocket implements WebSocketInterface {
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
