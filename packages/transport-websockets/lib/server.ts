import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { PassThrough, Readable } from 'node:stream'
import {
  ApiError,
  BaseTransportConnection,
  BinaryStreamResponse,
  Container,
  ExtensionApplication,
  JsonStreamResponse,
  Procedure,
  Scope,
  Stream,
  StreamResponse,
  Subscription,
  defer,
} from '@neematajs/application'
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
} from '@neematajs/common'
import uws from 'uWebSockets.js'
import { HttpPayloadGetParam, HttpTransportMethod, MessageType } from './common'
import {
  HttpTransportConnection,
  WebsocketsTransportConnection,
} from './connection'
import { WebsocketsTransport } from './transport'
import {
  Headers,
  HttpTransportData,
  HttpTransportOptions,
  Req,
  Res,
  WebSocket,
  WebSocketUserData,
  WebsocketsTransportData,
} from './types'

export const AUTH_KEY = Symbol('auth')
export const HTTP_SUFFIX = '\r\n\r\n'
export const CHARSET_SUFFIX = 'charset=utf-8'
export const JSON_CONTENT_TYPE_MIME = 'application/json'
export const APPLICATION_OCTET_STREAM_MIME = 'application/octet-stream'
export const PLAIN_CONTENT_TYPE_MIME = 'text/plain'
export const CONTENT_TYPE_HEADER = 'Content-Type'
export const CORS_ORIGIN_HEADER = 'Access-Control-Allow-Origin'
export const CORS_EXPOSE_HEADERS_HEADER = 'Access-Control-Expose-Headers'
export const HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': CONTENT_TYPE_HEADER,
  'Access-Control-Allow-Credentials': 'true',
}
export const InternalError = (message = 'Internal Server Error') =>
  new ApiError(ErrorCode.InternalServerError, message)

export const NotFoundError = (message = 'Not Found') =>
  new ApiError(ErrorCode.NotFound, message)

export const ForbiddenError = (message = 'Forbidden') =>
  new ApiError(ErrorCode.Forbidden, message)

export const RequestTimeoutError = (message = 'Request Timeout') =>
  new ApiError(ErrorCode.RequestTimeout, message)

export const getRequestData = (req: Req, res: Res) => {
  const method = req.getMethod()
  const url = getRequestUrl(req)
  const query = new URLSearchParams(req.getQuery() || undefined)
  const headers = getRequestHeaders(req)
  const proxyRemoteAddress = Buffer.from(
    res.getProxiedRemoteAddressAsText(),
  ).toString()
  const remoteAddress = Buffer.from(res.getRemoteAddressAsText()).toString()

  return { method, url, query, headers, proxyRemoteAddress, remoteAddress }
}

export const setCors = (res: Res, headers: Headers) => {
  // TODO: configurable cors
  const { origin } = headers
  if (origin) res.writeHeader(CORS_ORIGIN_HEADER, origin)
}

export const handleDefaultHeaders = (req: Req, res: Res) => {
  const headers = getRequestHeaders(req)
  setDefaultHeaders(res)
  setCors(res, headers)
}

export const getRequestHeaders = (req: Req) => {
  const headers = {}
  req.forEach((key, value) => (headers[key] = value))
  return headers
}

export const setDefaultHeaders = (res: Res) => {
  for (const [key, value] of Object.entries(HEADERS))
    res.writeHeader(key, value)
}

export const getRequestUrl = (req: Req) => {
  return new URL(req.getUrl(), 'http://' + (req.getHeader('host') || 'unknown'))
}

export const toJSON = (
  data: any,
  replacer?: (key: string, value: any) => any,
) => (data ? JSON.stringify(data, replacer) : undefined)

export const fromJSON = (
  data: any,
  replacer?: (key: string, value: any) => any,
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

  // biome-ignore lint/suspicious/noShadowRestrictedNames: is okay here
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

export abstract class BaseHttpTransportServer {
  protected server!: uws.TemplatedApp
  protected socket?: uws.us_listen_socket

  constructor(
    protected options: HttpTransportOptions,
    protected application: ExtensionApplication,
  ) {
    this.server = options.ssl ? uws.SSLApp(options.ssl) : uws.App()

    this.server.get(this.basePath('health'), (res, req) => {
      if (!this.socket) return void res.close()
      handleDefaultHeaders(req, res)
      res.end('OK')
    })

    this.server.any('/*', (res, req) => {
      if (!this.socket) return void res.close()
      handleDefaultHeaders(req, res)
      res.writeStatus('404 Not Found')
      res.endWithoutBody()
    })
  }

  async start() {
    const { hostname = '0.0.0.0', port, ssl } = this.options
    this.socket = await new Promise((r) => {
      // FIXME: incorrect behavior when using unix sockets
      if (hostname.startsWith('unix:')) {
        this.server.listen_unix(r, resolve(hostname.slice(5)))
      } else if (typeof port === 'number') {
        this.server.listen(hostname, port, r)
      }
    })
    // TODO: check if listeningSocket is valid, otherwise throw error
    this.logger.info(
      'Listening on %s://%s:%s',
      ssl ? 'https' : 'http',
      hostname,
      port,
    )
  }

  async stop() {
    this.server.close()
    this.socket = undefined
  }

  protected get api() {
    return this.application.api
  }

  protected get container() {
    return this.application.container
  }

  protected get logger() {
    return this.application.logger
  }

  protected basePath(...parts: string[]) {
    return '/' + parts.join('/')
  }

  protected async getConnectionData(transportData: any) {
    return this.application.api.getConnectionData(transportData)
  }

  protected handleContainerDisposal(container: Container) {
    return defer(() =>
      container.dispose().catch((cause) => {
        const message = 'Error while container disposal (potential memory leak)'
        const error = new Error(message, { cause })
        this.logger.error(error)
      }),
    )
  }

  protected async handleRPC(
    connection: BaseTransportConnection,
    procedure: Procedure,
    container: Container,
    payload: any,
  ) {
    this.logger.debug('Calling [%s] procedure...', procedure.name)
    return this.application.api.call({
      connection,
      procedure,
      payload,
      container,
      path: [procedure],
    })
  }
}

export class WebsocketsTransportServer extends BaseHttpTransportServer {
  sockets = new Set<WebSocket>()

  constructor(
    protected readonly transport: WebsocketsTransport,
    protected readonly application: ExtensionApplication,
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
          getRequestData(req, res)
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
            subscriptions: new Map(),
          }

          if (isAborted) throw new Error('Aborted')

          res.cork(() => {
            res.upgrade(
              wsData,
              headers['sec-websocket-key'],
              headers['sec-websocket-protocol'],
              headers['sec-websocket-extensions'],
              socket,
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
            id,
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
          const handler = this[type]
          if (handler) {
            const messageBuffer = message.slice(Uint8Array.BYTES_PER_ELEMENT)
            handler.call(this, ws, messageBuffer)
          } else {
            this.logger.warn('Unknown message type: %s', type)
          }
        } catch (error) {
          this.logger.error(error)
        }
      },
      close: async (ws, code, message) => {
        const { id, container, streams, subscriptions } = ws.getUserData()
        this.sockets.delete(ws)
        this.transport.removeConnection(id)
        for (const _streams of [streams.up, streams.down, subscriptions]) {
          for (const stream of _streams.values()) {
            // TODO: throw an error?: stream.destroy(new Error('Connection closed'))
            stream.destroy()
          }
          _streams.clear()
        }
        this.handleContainerDisposal(container)
      },
    })

    this.server.post(
      this.basePath('api', '*'),
      this.handleHTTPRequest.bind(this),
    )
    this.server.get(
      this.basePath('api', '*'),
      this.handleHTTPRequest.bind(this),
    )
    this.server.options(this.basePath('*'), (res, req) => {
      if (!this.socket) return void res.close()
      handleDefaultHeaders(req, res)
      if (
        req.getUrl().startsWith(this.basePath('api')) &&
        req.getMethod() === HttpTransportMethod.Post
      )
        res.writeHeader('Accept', JSON_CONTENT_TYPE_MIME)
      res.writeStatus('204 No Content')
      res.endWithoutBody()
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
          Uint32Array.BYTES_PER_ELEMENT + streamDataLength,
        ),
      ),
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
        this.transport.options.maxStreamChunkLength,
      )
      data.streams.up.set(id, stream)
      stream.on('error', (cause) =>
        this.logger.trace(new Error('Stream error', { cause })),
      )
    }

    const streamsReplacer = (key, value) => {
      if (
        value &&
        typeof value === 'string' &&
        value.startsWith(STREAM_SERIALIZE_KEY)
      ) {
        return data.streams.up.get(
          parseInt(value.slice(STREAM_SERIALIZE_KEY.length)),
        )
      }
      return value
    }

    const rpcPayload = fromJSON(
      decodeText(
        payloadBuf.slice(Uint32Array.BYTES_PER_ELEMENT + streamDataLength),
      ),
      streamsReplacer,
    )

    const [callId, procedureName, payload] = rpcPayload
    const container = data.container.createScope(Scope.Call)
    try {
      const procedure = await this.api.find(procedureName)
      const response = await this.handleRPC(
        connection,
        procedure,
        container,
        payload,
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
            chunk,
          )
        })
        response.once('end', () => {
          send(
            ws,
            MessageType.ServerStreamEnd,
            encodeNumber(streamId, 'Uint32'),
          )
        })

        response.once('error', () => {
          send(
            ws,
            MessageType.ServerStreamAbort,
            encodeNumber(streamId, 'Uint32'),
          )
        })
      } else if (response instanceof Subscription) {
        sendPayload(ws, MessageType.RpcSubscription, [callId, response.key])
        response.on('data', (payload) => {
          sendPayload(ws, MessageType.ServerSubscriptionEmit, [
            response.key,
            payload,
          ])
        })
        response.once('end', () => {
          sendPayload(ws, MessageType.ServerUnsubscribe, [response.key])
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
      send(ws, MessageType.ClientStreamEnd, encodeNumber(id, 'Uint32')),
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

  async [MessageType.ClientUnsubscribe](ws: WebSocket, buffer: ArrayBuffer) {
    const { subscriptions } = ws.getUserData()
    const [key] = fromJSON(decodeText(buffer))
    const subscription = subscriptions.get(key)
    if (!subscription) return void ws.close()
    subscription.unsubscribe()
  }

  protected async handleHTTPRequest(res: Res, req: Req) {
    if (!this.socket) return void res.close()

    let isAborted = false
    res.onAborted(() => (isAborted = true))
    const tryRespond = (cb) => !isAborted && res.cork(cb)

    const { headers, method, proxyRemoteAddress, query, remoteAddress, url } =
      getRequestData(req, res)

    const procedureName = url.pathname.substring(this.basePath('api/').length)
    const resHeaders = new Headers()

    const transportData: HttpTransportData = {
      transport: 'http',
      headers,
      query,
      proxyRemoteAddress,
      remoteAddress,
      method: method as HttpTransportMethod,
    }
    const container = this.application.container.createScope(Scope.Call)
    try {
      const body = await this.handleHTTPBody(req, res, method, query)
      const connectionData = await this.getConnectionData(transportData)
      const connection = new HttpTransportConnection(
        transportData,
        connectionData,
        resHeaders,
      )

      // TODO: is there any reason to keep connection for http/1 transport?
      // It doesn't support streams and bidi communication anyway,
      // so any of usefull stuff is not available
      // this.transport.addConnection(connection)
      const procedure = await this.api.find(procedureName)
      const response = await this.handleRPC(
        connection,
        procedure,
        container,
        body,
      )
      const isStream = response instanceof StreamResponse

      if (isStream) {
        if (method === HttpTransportMethod.Post) {
          response.destroy()
          throw new Error('Streams are not supported for POST method')
        } else if (response instanceof JsonStreamResponse) {
          response.destroy()
          throw new Error('JSON streams are not supported for GET method')
        }
      }

      tryRespond(() => {
        setCors(res, headers)
        setDefaultHeaders(res)
        for (const [name, value] of resHeaders) res.writeHeader(name, value)
        if (isStream)
          this.handleHTTPStreamResponse(
            req,
            res,
            headers,
            response as BinaryStreamResponse,
          )
        else this.handleHTTPResponse(req, res, headers, { response })
      })
    } catch (error) {
      tryRespond(() => {
        setDefaultHeaders(res)
        setCors(res, headers)
        res.writeHeader(CONTENT_TYPE_HEADER, JSON_CONTENT_TYPE_MIME)
        if (error instanceof ApiError) {
          this.handleHTTPResponse(req, res, headers, { error })
        } else {
          this.logger.error(new Error('Unexpected error', { cause: error }))
          res.writeStatus('500 Internal Server Error')
          this.handleHTTPResponse(req, res, headers, {
            error: InternalError(),
          })
        }
      })
    } finally {
      this.handleContainerDisposal(container)
    }
  }

  protected async handleHTTPBody(
    req: Req,
    res: Res,
    method: string,
    query: any,
  ) {
    if (method === HttpTransportMethod.Post) {
      if (!req.getHeader('content-type').startsWith(JSON_CONTENT_TYPE_MIME))
        throw new ApiError(ErrorCode.NotAcceptable, 'Unsupported body type')
      try {
        return await getBody(req, res).toJSON()
      } catch (error) {
        throw new ApiError(
          ErrorCode.NotAcceptable,
          'Unable to parse request body',
        )
      }
    } else {
      const rawPayload = query.get(HttpPayloadGetParam)
      return rawPayload ? fromJSON(rawPayload) : undefined
    }
  }

  protected async handleHTTPResponse(
    req: Req,
    res: Res,
    headers: Headers,
    data: any,
  ) {
    res.writeHeader(CONTENT_TYPE_HEADER, JSON_CONTENT_TYPE_MIME)
    res.end(toJSON(data))
  }

  protected handleHTTPStreamResponse(
    req: Req,
    res: Res,
    headers: Headers,
    stream: BinaryStreamResponse,
  ) {
    let isAborted = false
    const tryRespond = (cb) => !isAborted && res.cork(cb)
    res.onAborted(() => {
      isAborted = true
      stream.destroy(new Error('Aborted by client'))
    })
    stream.on('error', () => tryRespond(() => res.close()))
    stream.on('end', () => tryRespond(() => res.end()))
    stream.on('data', (chunk) => {
      // biome-ignore lint/style/noParameterAssign:
      chunk = encodeText(chunk + '\n')
      const arrayBuffer = chunk.buffer.slice(
        chunk.byteOffset,
        chunk.byteOffset + chunk.byteLength,
      )
      let ok = false
      tryRespond(() => (ok = res.write(arrayBuffer)))
      const lastOffset = res.getWriteOffset()
      if (!ok) {
        stream.pause()
        res.onWritable((offset) => {
          let ok = false
          tryRespond(() => {
            ok = res.write(arrayBuffer.slice(offset - lastOffset))
          })
          if (ok) stream.resume()
          return ok
        })
      }
    })
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
      true,
    )
    return result === 0 || result === 1
  } catch (error: any) {
    if (error.message !== CLOSED_SOCKET_MESSAGE) throw error
    return false
  }
}
