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
  encodeBigNumber,
  encodeNumber,
  encodeText,
} from '@neemata/common'
import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import qs from 'qs'
import {
  InternalError,
  Server,
  WebSocket,
  fromJSON,
  getRequestHeaders,
  toJSON,
} from '../server'

export class WsTransport {
  constructor(private readonly server: Server) {}

  get logger() {
    return this.server.config.logger
  }

  bind() {
    this.server.httpServer.ws(this.server.basePath('api'), {
      maxPayloadLength: 16 * 1024 * 1024,
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
        const query = qs.parse(req.getQuery(), this.server.config.qsOptions)

        const secKey = headers['sec-websocket-key']
        const secProtocol = headers['sec-websocket-protocol']
        const secExtensions = headers['sec-websocket-extensions']

        const streams = new Map()
        const events = new EventEmitter()

        const params: ConnectionScopeParams = {
          headers,
          query,
          proxyRemoteAddress,
          remoteAddress,
        }
        const container = this.server.container.copy(Scope.Connection, params)
        const wsData = {
          id: randomUUID(),
          streams,
          container: container,
          params,
          events,
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
        const { id, events } = ws.getUserData()
        this.logger.trace('Open new websocket [%s]', id)

        this.server.websockets.set(
          id,
          createWsInterface(this.server.rooms, ws, id)
        )
        events.on(MessageType.Rpc.toString(), this.handleRPC.bind(this))
        events.on(
          MessageType.StreamPush.toString(),
          this.handleStreamPush.bind(this)
        )
        events.on(
          MessageType.StreamEnd.toString(),
          this.handleStreamEnd.bind(this)
        )
        events.on(
          MessageType.StreamTerminate.toString(),
          this.handleStreamTerminate.bind(this)
        )
        events.on(MessageType.Event.toString(), (event, data) => {
          sendToWebsocket(ws, MessageType.Event, { event, data })
        })
      },
      message: (ws, message, isBinary) => {
        if (!isBinary) return void ws.close()
        const { id, events } = ws.getUserData()
        this.logger.trace('Receive websocket [%s] message', id)
        try {
          const buf = Buffer.from(message)
          const type = buf.subarray(0, Uint8Array.BYTES_PER_ELEMENT).readUint8()
          const buffer = buf.subarray(Uint8Array.BYTES_PER_ELEMENT)
          events.emit(type.toString(), ws, buffer)
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

        const room: Room = this.server.rooms.get(roomId) ?? {
          id: roomId,
          websockets: new Set(),
          publish: (event: string, data: any, exclude?: WebSocketInterface) => {
            for (const ws of room.websockets) {
              if (!exclude || exclude.id !== ws.id) {
                ws.send(event, data)
              }
            }
          },
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
        const { id, container, streams, events } = ws.getUserData()
        this.logger.trace('Close websocket [%s]', id)
        this.server.websockets.delete(id)
        events.removeAllListeners()
        for (const stream of streams.values()) stream.destroy()
        streams.clear()
        await container.dispose()
      },
    })
  }

  async handleRPC(ws: WebSocket, payloadBuf: Buffer) {
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

    for (const stream of streamsPayload) {
      const { id, ...meta } = stream
      streams.set(id.toString(), createStream(ws, id, meta))
    }

    const streamsReplacer = (key, value) => {
      if (typeof value === 'string' && value.startsWith(STREAM_ID_PREFIX)) {
        return streams.get(value.slice(STREAM_ID_PREFIX.length))
      }
      return value
    }

    const rpcPayload = fromJSON(
      payloadBuf.subarray(Uint32Array.BYTES_PER_ELEMENT + streamsPayloadLength),
      streamsReplacer
    )

    const type = MessageType.Rpc

    let { id, container, params } = ws.getUserData()
    const { procedure, payload, callId } = rpcPayload

    const callParams: CallScopeParams<(typeof Transport)['Ws']> = {
      ...params,
      transport: Transport.Ws,
      procedure,
      websocket: this.server.websockets.get(id),
    }
    const scopeContainer = container.copy(Scope.Call, callParams)

    try {
      await scopeContainer.load()
      const response = await this.server.handleRPC(
        procedure,
        scopeContainer,
        payload,
        Transport.Ws,
        callParams
      )
      sendToWebsocket(ws, type, { callId, payload: { response } })
    } catch (error) {
      if (error instanceof ApiError) {
        sendToWebsocket(ws, type, { callId, payload: { error } })
      } else {
        this.logger.error(new Error('Unexpected error', { cause: error }))
        sendToWebsocket(ws, type, { callId, payload: { error: InternalError } })
      }
    } finally {
      await scopeContainer
        .dispose()
        .catch(
          (cause) => new Error('Error while disposing call context', { cause })
        )
    }
  }

  async handleStreamPush(ws: WebSocket, buffer: Buffer) {
    const { streams } = ws.getUserData()
    const id = buffer.readUint32LE()
    const stream = streams.get(id.toString())
    if (!stream) ws.close()
    const chunk = buffer.subarray(Uint32Array.BYTES_PER_ELEMENT)
    stream.push(chunk)
    stream.emit('received', chunk.byteLength)
  }

  async handleStreamEnd(ws: WebSocket, buffer: Buffer) {
    const { streams } = ws.getUserData()
    const id = buffer.readUint32LE().toString()
    const stream = streams.get(id)
    if (!stream) return void ws.close()
    stream.end()
    streams.delete(id)
  }

  async handleStreamTerminate(ws: WebSocket, buffer: Buffer) {
    const { streams } = ws.getUserData()
    const id = buffer.readUint32LE().toString()
    const stream = streams.get(id)
    if (!stream) ws.close()
    stream.destroy(new Error('Termiated by client'))
    streams.delete(id)
  }
}

const sendToWebsocket = (ws: WebSocket, type: number, payload: any) =>
  ws.send(
    concat(encodeNumber(type, Uint8Array), encodeText(toJSON(payload))),
    true
  )

const createStream = (ws: WebSocket, id: number, meta: StreamMeta) => {
  const stream = new PassThrough()
  let paused = stream.isPaused()
  let bytesReceived = 0

  const pull = () => {
    ws.send(
      concat(
        encodeNumber(MessageType.StreamPull, Uint8Array),
        encodeNumber(id, Uint32Array),
        encodeBigNumber(bytesReceived, BigUint64Array)
      ),
      true
    )
    return new Promise<void>((resolve) =>
      stream.once('received', (byteLength) => {
        bytesReceived += byteLength
        resolve()
      })
    )
  }

  const setPause = () => stream.isPaused()

  stream.on('pause', setPause)
  stream.on('resume', setPause)

  const tryPull = async () => {
    if (!paused) return true
    if (stream.writableFinished) return false
    return new Promise((r) => stream.once('resume', r))
  }

  stream.once('resume', async () => {
    while (await tryPull()) await pull() // TODO: wtf is this???
  })

  return Object.assign(stream, { meta })
}

const createWsInterface = (
  rooms: Map<string, Room>,
  ws: WebSocket,
  wsId: string
): WebSocketInterface => ({
  id: wsId,
  send: (event: string, data: any) =>
    sendToWebsocket(ws, MessageType.Event, { event, data }),
  rooms: () => {
    const wsRooms = new Set<Room>()
    for (const roomId of ws.getTopics()) {
      const room = rooms.get(roomId)
      if (room) wsRooms.add(room)
    }
    return wsRooms
  },
  join: (roomId: string) => ws.subscribe(roomId),
  leave: (roomId: string) => ws.unsubscribe(roomId),
})
