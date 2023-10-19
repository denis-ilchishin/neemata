import {
  ApiError,
  MessageType,
  STREAM_ID_PREFIX,
  Scope,
  StreamMeta,
  StreamsPayloadView,
  Transport,
  concat,
  decodeText,
  encodeNumber,
  encodeText,
} from '@neemata/common'
import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import qs from 'qs'
import {
  InternalError,
  Server,
  WebSocket,
  fromJSON,
  getRequestHeaders,
  toJSON,
} from '../server'

const sendPayload = (ws: WebSocket, type: number, payload: any) => {
  send(ws, type, encodeText(toJSON(payload)))
}

const send = (ws: WebSocket, type: number, ...buffers: ArrayBuffer[]) => {
  try {
    ws.send(concat(encodeNumber(type, Uint8Array), ...buffers), true)
  } catch (error) {
    if (
      error.message !== 'Invalid access of closed uWS.WebSocket/SSLWebSocket.'
    )
      throw error
  }
}

export class WsTransport {
  constructor(private readonly server: Server) {}

  get logger() {
    return this.server.app.config.logger
  }

  bind() {
    this.server.httpServer.ws(this.server.basePath('api'), {
      maxPayloadLength: this.server.app.config.maxPayloadLength,
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
        const query = qs.parse(req.getQuery(), this.server.app.config.qsOptions)

        const secKey = headers['sec-websocket-key']
        const secProtocol = headers['sec-websocket-protocol']
        const secExtensions = headers['sec-websocket-extensions']

        const streams = new Map()

        const params: ConnectionScopeParams = {
          headers,
          query,
          proxyRemoteAddress,
          remoteAddress,
        }
        const container = this.server.app.container.copy(
          Scope.Connection,
          params
        )
        const wsData = {
          id: randomUUID(),
          streams,
          container: container,
          params,
        }
        try {
          await container.load()
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
        const { id } = ws.getUserData()
        this.logger.trace('Open new websocket [%s]', id)

        this.server.websockets.set(
          id,
          new WebsocketInterface(id, ws, this.server.rooms)
        )
      },
      message: (ws, message, isBinary) => {
        if (!isBinary) return void ws.close()
        const { id } = ws.getUserData()
        try {
          const messageBuffer = Buffer.from(message)
          const type = messageBuffer
            .subarray(0, Uint8Array.BYTES_PER_ELEMENT)
            .readUint8() as unknown as MessageType
          const buffer = messageBuffer.subarray(Uint8Array.BYTES_PER_ELEMENT)
          this.logger.trace('Received websocket [%s] message [%s]', id)
          const valid = this[type]?.(ws, buffer)
          if (!valid) throw new Error('Unsupported message type')
        } catch (error) {
          this.logger.error(error)
        }
      },
      subscription: (ws, roomIdBuff, newCount, oldCount) => {
        const { id } = ws.getUserData()
        const wsInterface = this.server.websockets.get(id)
        const roomId = decodeText(roomIdBuff)
        const unsubscribed = newCount < oldCount

        this.logger.debug(
          '%s websocket [%s] %s room [%s]',
          unsubscribed ? 'Unsubscribe' : 'Subscribe',
          id,
          unsubscribed ? 'from' : 'to',
          roomId
        )

        let room: Room = this.server.rooms.get(roomId)

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
          this.server.rooms.delete(roomId)
        } else {
          if (unsubscribed) room.websockets.delete(wsInterface)
          else room.websockets.add(wsInterface)

          if (!this.server.rooms.has(roomId))
            this.server.rooms.set(roomId, room)
        }
      },
      close: async (ws, code, message) => {
        const { id, container, streams } = ws.getUserData()
        this.logger.trace('Close websocket [%s]', id)
        this.server.websockets.delete(id)
        for (const stream of streams.values())
          stream.destroy(new Error('Client is closed'))
        streams.clear()
        await container.dispose()
      },
    })
  }

  async [MessageType.Rpc](ws: WebSocket, payloadBuf: Buffer) {
    //TODO: refactor this mess

    const { streams } = ws.getUserData()
    const streamsPayloadLength = payloadBuf
      .subarray(0, StreamsPayloadView.BYTES_PER_ELEMENT)
      .readUint32LE()

    const streamsPayload = fromJSON(
      payloadBuf.subarray(
        Uint32Array.BYTES_PER_ELEMENT,
        Uint32Array.BYTES_PER_ELEMENT + streamsPayloadLength
      )
    )

    for (const _stream of streamsPayload) {
      const { id, ...meta } = _stream
      const stream = new Stream(
        ws,
        id,
        meta,
        this.server.app.config.maxStreamChunkLength
      )
      stream.once('error', () => {
        send(ws, MessageType.StreamTerminate, encodeNumber(id, Uint32Array))
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
      payloadBuf.subarray(Uint32Array.BYTES_PER_ELEMENT + streamsPayloadLength),
      streamsReplacer
    )

    const type = MessageType.Rpc

    // let { id, container, params } = ws.getUserData()
    const wsData = ws.getUserData()

    const { procedure, payload, callId } = rpcPayload

    const callParams: CallScopeParams<(typeof Transport)['Ws']> = Object.freeze(
      {
        ...wsData.params,
        transport: Transport.Ws,
        procedure,
        websocket: this.server.websockets.get(wsData.id),
      }
    )
    const container = wsData.container.copy(Scope.Call, callParams)

    try {
      await container.load()
      const response = await this.server.handleRPC(
        procedure,
        container,
        payload,
        Transport.Ws,
        callParams
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
      await container
        .dispose()
        .catch(
          (cause) => new Error('Error while disposing call context', { cause })
        )
    }
  }

  async [MessageType.StreamPush](ws: WebSocket, buffer: Buffer) {
    const { streams } = ws.getUserData()
    const id = buffer.readUint32LE()
    const stream = streams.get(id)
    if (!stream) ws.close()
    stream.push(buffer.subarray(Uint32Array.BYTES_PER_ELEMENT))
  }

  async [MessageType.StreamEnd](ws: WebSocket, buffer: Buffer) {
    const { streams } = ws.getUserData()
    const id = buffer.readUint32LE()
    const stream = streams.get(id)
    if (!stream) return void ws.close()
    stream.push(null)
    streams.delete(id)
  }

  async [MessageType.StreamTerminate](ws: WebSocket, buffer: Buffer) {
    const { streams } = ws.getUserData()
    const id = buffer.readUint32LE()
    const stream = streams.get(id)
    if (!stream) ws.close()
    stream.destroy(new Error('Termiated by client'))
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
      encodeNumber(this.id, Uint32Array),
      size ? encodeNumber(size, Uint32Array) : null
    )
  }

  push(chunk?: Buffer) {
    if (chunk !== null) this.bytesReceived += chunk.byteLength
    return super.push(chunk)
  }
}

class WebsocketInterface implements WebSocketInterface {
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

  rooms() {
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
