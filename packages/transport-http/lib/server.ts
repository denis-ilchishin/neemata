import {
  ApiError,
  BaseTransportConnection,
  BinaryStreamResponse,
  Container,
  ErrorCode,
  ExtensionApplication,
  JsonStreamResponse,
  Scope,
  StreamResponse,
  defer,
} from '@neemata/application'
import { StreamDataType, encodeText } from '@neemata/common'
import { resolve } from 'node:path'
import { PassThrough, Readable } from 'node:stream'
import qs from 'qs'
import uws from 'uWebSockets.js'
import { HttpTransport } from '..'
import { HttpTransportConnection } from './connection'
import {
  Headers,
  HttpTransportApplicationContext,
  HttpTransportData,
  HttpTransportMethod,
  HttpTransportOptions,
  HttpTransportProcedureOptions,
  Req,
  Res,
} from './types'

export const AUTH_KEY = Symbol('auth')
export const HTTP_SUFFIX = '\r\n\r\n'
export const CHARSET_SUFFIX = 'charset=utf-8'
export const JSON_CONTENT_TYPE_MIME = 'application/json'
export const PLAIN_CONTENT_TYPE_MIME = 'text/plain'
export const CONTENT_TYPE_HEADER = 'Content-Type'
export const STREAM_DATA_TYPE_HEADER = 'X-Neemata-Stream-Data-Type'
export const STREAM_PAYLOAD_LENGTH_HEADER = 'X-Neemata-Stream-Payload-Length'
export const STREAM_PROTOCOL_SUPPORT_HEADER =
  'X-Neemata-Stream-Protocol-Support'
export const CORS_ORIGIN_HEADER = 'Access-Control-Allow-Origin'
export const CORS_EXPOSE_HEADERS_HEADER = 'Access-Control-Expose-Headers'
export const HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type,X-Neemata-Stream-Protocol-Support',
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

export const getRequestData = (
  req: Req,
  res: Res,
  qsOptions?: qs.IParseOptions
) => {
  const method = req.getMethod()
  const url = getRequestUrl(req)
  const query = qs.parse(req.getQuery(), qsOptions)
  const headers = getRequestHeaders(req)
  const proxyRemoteAddress = Buffer.from(
    res.getProxiedRemoteAddressAsText()
  ).toString()
  const remoteAddress = Buffer.from(res.getRemoteAddressAsText()).toString()

  return { method, url, query, headers, proxyRemoteAddress, remoteAddress }
}

export const setCors = (res: Res, headers: Headers) => {
  // TODO: configurable cors
  const origin = headers['origin']
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

export abstract class BaseHttpTransportServer {
  protected server!: uws.TemplatedApp
  protected socket?: uws.us_listen_socket

  constructor(
    protected options: HttpTransportOptions,
    protected application: ExtensionApplication
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
      // TODO: incorrect behavior when using unix sockets
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
      port
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
      })
    )
  }

  protected async handleRPC(
    connection: BaseTransportConnection,
    name: string,
    container: Container,
    payload: any
  ) {
    this.logger.debug('Calling [%s] procedure...', name)
    const procedure = await this.application.api.find(name)
    return this.application.api.call({
      connection,
      name,
      procedure,
      payload,
      container,
    })
  }
}

export class HttpTransportServer extends BaseHttpTransportServer {
  constructor(
    protected readonly transport: HttpTransport,
    application: ExtensionApplication<
      HttpTransportProcedureOptions,
      HttpTransportApplicationContext
    >
  ) {
    super(transport.options, application)
    this.server.post(this.basePath('api', '*'), this.handleRequest.bind(this))
    this.server.get(this.basePath('api', '*'), this.handleRequest.bind(this))
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

  protected async handleRequest(res: Res, req: Req) {
    if (!this.socket) return void res.close()

    let isAborted = false
    res.onAborted(() => (isAborted = true))
    const tryRespond = (cb) => !isAborted && res.cork(cb)

    const { headers, method, proxyRemoteAddress, query, remoteAddress, url } =
      getRequestData(req, res, this.transport.options.qsOptions)

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
      const body = await this.handleBody(req, res, method, query)

      const connectionData = await this.getConnectionData(transportData)
      const connection = new HttpTransportConnection(
        transportData,
        connectionData
      )

      // TODO: is there any reason to keep connection for http/1 transport?
      // It doesn't support streams and bidi communication anyway,
      // so any of usefull stuff is not available
      // this.transport.addConnection(connection)

      const response = await this.handleRPC(
        connection,
        procedureName,
        container,
        body
      )
      const isStream = response instanceof StreamResponse
      tryRespond(() => {
        setCors(res, headers)
        setDefaultHeaders(res)
        for (const [name, value] of resHeaders) res.writeHeader(name, value)
        if (isStream) this.handleStreamResponse(req, res, headers, response)
        else this.handleResponse(req, res, headers, { response })
      })
    } catch (error) {
      tryRespond(() => {
        setDefaultHeaders(res)
        setCors(res, headers)
        res.writeHeader(CONTENT_TYPE_HEADER, JSON_CONTENT_TYPE_MIME)
        if (error instanceof ApiError) {
          this.handleResponse(req, res, headers, { error })
        } else {
          this.logger.error(new Error('Unexpected error', { cause: error }))
          res.writeStatus('500 Internal Server Error')
          this.handleResponse(req, res, headers, {
            error: InternalError(),
          })
        }
      })
    } finally {
      this.handleContainerDisposal(container)
    }
  }

  protected async handleBody(req: Req, res: Res, method: string, query: any) {
    if (method === HttpTransportMethod.Post) {
      if (!req.getHeader('content-type').startsWith(JSON_CONTENT_TYPE_MIME))
        throw new ApiError(ErrorCode.NotAcceptable, 'Unsupported body type')
      try {
        return await getBody(req, res).toJSON()
      } catch (error) {
        throw new ApiError(
          ErrorCode.NotAcceptable,
          'Unable to parse request body'
        )
      }
    } else {
      return query
    }
  }

  protected async handleResponse(
    req: Req,
    res: Res,
    headers: Headers,
    data: any
  ) {
    res.writeHeader(CONTENT_TYPE_HEADER, JSON_CONTENT_TYPE_MIME)
    res.end(toJSON(data))
  }

  protected handleStreamResponse(
    req: Req,
    res: Res,
    headers: Headers,
    stream: Readable
  ) {
    // whether client supports neemata custom stream "protocol"
    const isProtocolSupported =
      headers[STREAM_PROTOCOL_SUPPORT_HEADER.toLocaleLowerCase()]
    let isAborted = false
    const tryRespond = (cb) => !isAborted && res.cork(cb)
    res.onAborted(() => {
      isAborted = true
      stream.destroy(new Error('Aborted by client'))
      resolve()
    })
    stream.on('error', () => tryRespond(() => res.close()))
    stream.on('end', () =>
      tryRespond(() => {
        if (stream instanceof JsonStreamResponse && !isProtocolSupported) {
          res.end(encodeText(']'))
        } else {
          res.end()
        }
        resolve()
      })
    )
    stream.on('data', (chunk) => {
      if (stream instanceof JsonStreamResponse) {
        if (!isProtocolSupported) chunk = ',' + chunk
      }
      chunk = encodeText(chunk + '\n')
      const arrayBuffer = chunk.buffer.slice(
        chunk.byteOffset,
        chunk.byteOffset + chunk.byteLength
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
    const streamType =
      stream instanceof JsonStreamResponse
        ? StreamDataType.Json
        : StreamDataType.Binary
    res.writeHeader(
      CORS_EXPOSE_HEADERS_HEADER,
      [STREAM_DATA_TYPE_HEADER, STREAM_PAYLOAD_LENGTH_HEADER].join()
    )
    res.writeHeader(STREAM_DATA_TYPE_HEADER, streamType)
    if (stream instanceof JsonStreamResponse) {
      if (!isProtocolSupported) {
        res.writeHeader(CONTENT_TYPE_HEADER, JSON_CONTENT_TYPE_MIME)
        res.write(encodeText('['))
      } else {
        res.writeHeader(CONTENT_TYPE_HEADER, 'application/octet-stream')
      }

      res.write(toJSON(stream.payload) + '\n')
    } else if (stream instanceof BinaryStreamResponse) {
      if (isProtocolSupported) {
        const payload = encodeText(toJSON(stream.payload)!)
        res.writeHeader(
          CONTENT_TYPE_HEADER,
          isProtocolSupported ? 'application/octet-stream' : stream.type
        )
        res.writeHeader(STREAM_PAYLOAD_LENGTH_HEADER, `${payload.byteLength}`)
        res.write(payload)
      }
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
