import {
  ApiError,
  ExtensionApplication,
  JsonStreamResponse,
  Scope,
  Stream,
  StreamResponse,
} from '@neemata/application'
import {
  AbortStreamError,
  ErrorCode,
  STREAM_SERIALIZE_KEY,
  StreamDataType,
  concat,
  decodeNumber,
  decodeText,
  encodeNumber,
  encodeText,
} from '@neemata/common'
import {
  BaseHttpTransportServer,
  InternalError,
  fromJSON,
  getRequestData,
  toJSON,
} from '@neemata/transport-http'
import { randomUUID } from 'node:crypto'
import { MessageType } from './common'
import { WebsocketsTransportConnection } from './connection'
import { WebsocketsTransport } from './transport'
import {
  WebSocket,
  WebSocketUserData,
  WebsocketsTransportApplicationContext,
  WebsocketsTransportData,
  WebsocketsTransportProcedureOptions,
} from './types'

export class WebsocketsTransportServer extends BaseHttpTransportServer {
  sockets = new Set<WebSocket>()

  constructor(
    protected readonly transport: WebsocketsTransport,
    protected readonly application: ExtensionApplication<
      WebsocketsTransportProcedureOptions,
      WebsocketsTransportApplicationContext
    >
  ) {
    super(transport.options, application)

    this.server.ws(this.basePath('api'), {
      maxPayloadLength: this.transport.options.maxPayloadLength,
      sendPingsAutomatically: true,
      upgrade: async (res, req, socket) => {
        if (!socket) return void res.close()
        let isAborted = false
        res.onAborted(() => (isAborted = true))
        const { headers, proxyRemoteAddress, query, remoteAddress } =
          getRequestData(req, res, this.transport.options.qsOptions)
        const transportData: WebsocketsTransportData = {
          transport: 'websockets',
          headers,
          query,
          proxyRemoteAddress,
          remoteAddress,
        }

        const container = this.container.createScope(Scope.Connection)

        try {
          const connectionData = await this.getConnectionData(transportData)
          const streams = {
            up: new Map(),
            down: new Map(),
            streamId: 0,
          }
          const wsData: WebSocketUserData = {
            id: randomUUID(),
            streams,
            container,
            connectionData,
            transportData,
          }

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
        } catch (error: any) {
          this.handleContainerDisposal(container)
          if (error.message === 'Aborted') return void res.close()
          res.cork(() => {
            if (
              error instanceof ApiError &&
              error.code === ErrorCode.Unauthorized
            ) {
              res.writeStatus('401 Unauthorized').end()
            } else {
              res.writeStatus('500 Internal Server Error').end()
              this.logger.error(error)
            }
          })
        }
      },
      open: async (ws: WebSocket) => {
        this.sockets.add(ws)
        const { id, connectionData, transportData } = ws.getUserData()
        this.logger.trace('Open new websocket [%s]', id)
        try {
          const connection = new WebsocketsTransportConnection(
            transportData,
            connectionData,
            ws,
            id
          )
          this.transport.addConnection(connection)
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
        this.transport.removeConnection(id)
        for (const [_, stream] of streams.up) stream.destroy()
        for (const [_, stream] of streams.down) stream.destroy()
        streams.up.clear()
        streams.down.clear()
        this.handleContainerDisposal(container)
      },
    })
  }

  protected async [MessageType.Rpc](ws: WebSocket, payloadBuf: ArrayBuffer) {
    // TODO: refactor this mess

    const data = ws.getUserData()
    const connection = this.transport.getConnection(data.id)
    if (!connection) return void ws.close()

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
        const buffers = [encodeNumber(id, 'Uint32')]
        if (size) buffers.push(encodeNumber(size, 'Uint32'))
        send(ws, MessageType.ClientStreamPull, ...buffers)
      }
      const stream = new Stream(
        id,
        metadata,
        read,
        this.transport.options.maxStreamChunkLength
      )
      data.streams.up.set(id, stream)
      stream.on('error', (cause) =>
        this.logger.trace(new Error('Stream error', { cause }))
      )
    }

    const streamsReplacer = (key, value) => {
      if (typeof value === 'string' && value.startsWith(STREAM_SERIALIZE_KEY)) {
        return data.streams.up.get(
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
        connection,
        procedure,
        container,
        payload
      )
      if (response instanceof StreamResponse) {
        const streamDataType =
          response instanceof JsonStreamResponse
            ? StreamDataType.Json
            : StreamDataType.Binary

        const streamId = ++data.streams.streamId
        sendPayload(ws, MessageType.RpcStream, [
          callId,
          streamDataType,
          streamId,
          response.payload,
        ])
        data.streams.down.set(streamId, response)
        response.on('data', (chunk) => {
          response.pause()
          send(
            ws,
            MessageType.ServerStreamPush,
            encodeNumber(streamId, 'Uint32'),
            chunk
          )
        })
        response.once('end', () => {
          send(
            ws,
            MessageType.ServerStreamEnd,
            encodeNumber(streamId, 'Uint32')
          )
        })

        response.once('error', () => {
          send(
            ws,
            MessageType.ServerStreamAbort,
            encodeNumber(streamId, 'Uint32')
          )
        })
      } else {
        sendPayload(ws, MessageType.Rpc, [callId, response, null])
      }
    } catch (error) {
      if (error instanceof ApiError) {
        sendPayload(ws, MessageType.Rpc, [callId, null, error])
      } else {
        this.logger.error(new Error('Unexpected error', { cause: error }))
        sendPayload(ws, MessageType.Rpc, [callId, null, InternalError()])
      }
    } finally {
      this.handleContainerDisposal(container)
    }
  }

  async [MessageType.ClientStreamPush](ws: WebSocket, buffer: ArrayBuffer) {
    const { streams } = ws.getUserData()
    const id = decodeNumber(buffer, 'Uint32')
    const stream = streams.up.get(id)
    if (!stream) return void ws.close()
    else stream.push(Buffer.from(buffer.slice(Uint32Array.BYTES_PER_ELEMENT)))
  }

  async [MessageType.ClientStreamEnd](ws: WebSocket, buffer: ArrayBuffer) {
    const { streams } = ws.getUserData()
    const id = decodeNumber(buffer, 'Uint32')
    const stream = streams.up.get(id)
    if (!stream) return void ws.close()
    stream.once('finish', () =>
      send(ws, MessageType.ClientStreamEnd, encodeNumber(id, 'Uint32'))
    )
    stream.push(null)
    streams.up.delete(id)
  }

  async [MessageType.ClientStreamAbort](ws: WebSocket, buffer: ArrayBuffer) {
    const { streams } = ws.getUserData()
    const id = decodeNumber(buffer, 'Uint32')
    const stream = streams.up.get(id)
    if (!stream) ws.close()
    else stream.destroy(new AbortStreamError('Aborted by client'))
  }

  async [MessageType.ServerStreamPull](ws: WebSocket, buffer: ArrayBuffer) {
    const { streams } = ws.getUserData()
    const id = decodeNumber(buffer, 'Uint32')
    const stream = streams.down.get(id)
    if (!stream) return void ws.close()
    stream.resume()
  }

  async [MessageType.ServerStreamEnd](ws: WebSocket, buffer: ArrayBuffer) {
    const { streams } = ws.getUserData()
    const id = decodeNumber(buffer, 'Uint32')
    const stream = streams.down.get(id)
    if (!stream) return void ws.close()
    streams.down.delete(id)
  }

  async [MessageType.ServerStreamAbort](ws: WebSocket, buffer: ArrayBuffer) {
    const { streams } = ws.getUserData()
    const id = decodeNumber(buffer, 'Uint32')
    const stream = streams.down.get(id)
    if (!stream) return void ws.close()
    stream.destroy(new AbortStreamError('Aborted by client'))
  }
}

const CLOSED_SOCKET_MESSAGE =
  'Invalid access of closed uWS.WebSocket/SSLWebSocket.'

export const sendPayload = (ws: WebSocket, type: number, payload: any) => {
  return send(ws, type, encodeText(toJSON(payload)!))
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
