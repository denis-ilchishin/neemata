import {
  ApiError,
  BaseClient,
  Container,
  ErrorCode,
  ExtensionInstallOptions,
  JsonStreamResponse,
  Scope,
  defer,
} from '@neemata/application'
import { StreamDataType, encodeText } from '@neemata/common'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { PassThrough, Readable } from 'node:stream'
import qs from 'qs'
import uws from 'uWebSockets.js'
import { HttpTransportClient } from './client'
import {
  Headers,
  HttpTransportApplicationContext,
  HttpTransportClientContext,
  HttpTransportData,
  HttpTransportMethod,
  HttpTransportOptions,
  HttpTransportProcedureOptions,
  HttpTransportProtocol,
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
export const CORS_ORIGIN_HEADER = 'Access-Control-Allow-Origin'
export const CORS_EXPOSE_HEADERS_HEADER = 'Access-Control-Expose-Headers'
export const HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
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

export class HttpTransportServer {
  protected server: uws.TemplatedApp
  protected listeningSocket!: uws.us_listen_socket

  clients = new Map<string, BaseClient>()

  constructor(
    protected readonly options: HttpTransportOptions<any>,
    protected readonly application: ExtensionInstallOptions<
      HttpTransportProcedureOptions,
      HttpTransportApplicationContext
    >
  ) {
    this.server = options.ssl ? uws.SSLApp(options.ssl) : uws.App()

    this.server.get(this.basePath('health'), (res, req) => {
      if (!this.listeningSocket) return void res.close()
      this.handleDefaultHeaders(req, res)
      res.end('OK')
    })
    this.server.any('/*', (res, req) => {
      if (!this.listeningSocket) return void res.close()
      this.handleDefaultHeaders(req, res)
      res.writeStatus('404 Not Found')
      res.end('Not Found')
    })

    this.bindHandlers()
  }

  async start() {
    const { hostname, port, ssl } = this.options
    this.listeningSocket = await new Promise((r) => {
      // TODO: incorrect behavior when using unix sockets
      if (hostname.startsWith('unix:')) {
        this.server.listen_unix(r, resolve(hostname.slice(5)))
      } else if (typeof port !== 'string') {
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
    this.listeningSocket = undefined
  }

  protected get logger() {
    return this.application.logger
  }

  protected get api() {
    return this.application.api
  }

  protected get container() {
    return this.application.container
  }

  protected bindHandlers() {
    this.server.post(this.basePath('api', '*'), this.handleRequest.bind(this))
    // this.server.get(this.basePath('api', '*'), this.handleRequest.bind(this))
    this.server.options(this.basePath('*'), (res, req) => {
      if (!this.listeningSocket) return void res.close()
      this.handleDefaultHeaders(req, res)
      if (
        req.getUrl().startsWith(this.basePath('api')) &&
        req.getMethod() === HttpTransportMethod.Post
      )
        res.writeHeader('Accept', JSON_CONTENT_TYPE_MIME)
      res.writeStatus('204 No Content')
      res.endWithoutBody()
    })
  }

  protected basePath(...parts: string[]) {
    return '/' + parts.join('/')
  }

  protected setCors(res: Res, headers: Headers) {
    //TODO: configurable cors
    const origin = headers['origin']
    if (origin) res.writeHeader(CORS_ORIGIN_HEADER, origin)
  }

  protected async handleRPC(
    client: BaseClient,
    name: string,
    container: Container,
    payload: any
  ) {
    this.logger.debug('Calling [%s] procedure...', name)
    const declaration = await this.application.api.find(name)
    return this.application.api.call({
      client,
      name,
      declaration,
      payload,
      container,
    })
  }

  protected handleDispose(container: Container) {
    return defer(() =>
      container.dispose().catch((cause) => {
        const message = 'Error while container disposal (potential memory leak)'
        const error = new Error(message, { cause })
        this.logger.error(error)
      })
    )
  }

  protected async handleRequest(res: Res, req: Req) {
    if (!this.listeningSocket) return void res.close()

    let isAborted = false
    res.onAborted(() => (isAborted = true))
    const tryRespond = (cb) => !isAborted && res.cork(cb)

    const { headers, method, proxyRemoteAddress, query, remoteAddress, url } =
      this.getRequestData(req, res)

    const procedureName = url.pathname.substring(this.basePath('api/').length)
    const resHeaders = new Map<string, string>()
    const setResponseHeader = (name: string, value: string) =>
      resHeaders.set(name, value)

    const transportData: HttpTransportData = {
      headers,
      query,
      proxyRemoteAddress,
      remoteAddress,
      protocol: HttpTransportProtocol.Http,
      method: method as HttpTransportMethod,
    }

    const clientContext: HttpTransportClientContext = {
      id: randomUUID(),
      setResponseHeader,
      ...transportData,
    }

    try {
      const body = await this.handleBody(req, res, method, query)
      const container = this.application.container.createScope(Scope.Call)
      const clientData = await this.getClientData(clientContext)
      const client = new HttpTransportClient(clientContext, clientData)
      this.clients.set(client.id, client)
      const response = await this.handleRPC(
        client,
        procedureName,
        container,
        body
      )
      const isStream = response instanceof Readable
      tryRespond(() => {
        this.setCors(res, headers)
        this.setDefaultHeaders(res)
        for (const [name, value] of resHeaders) res.writeHeader(name, value)
        if (isStream) this.handleHttpStreamResponse(req, res, headers, response)
        else this.handleHttpResponse(req, res, headers, { response })
      })
      this.handleDispose(container)
    } catch (error) {
      tryRespond(() => {
        this.setDefaultHeaders(res)
        this.setCors(res, headers)
        res.writeHeader(CONTENT_TYPE_HEADER, JSON_CONTENT_TYPE_MIME)
        if (error instanceof ApiError) {
          this.handleHttpResponse(req, res, headers, { error })
        } else {
          this.logger.error(new Error('Unexpected error', { cause: error }))
          res.writeStatus('500 Internal Transport Error')
          this.handleHttpResponse(req, res, headers, { error: InternalError() })
        }
      })
    }
  }

  protected getRequestData(req: Req, res: Res) {
    const method = req.getMethod()
    const url = this.getRequestUrl(req)
    const query = qs.parse(req.getQuery(), this.options.qsOptions)
    const headers = this.getRequestHeaders(req)
    const proxyRemoteAddress = Buffer.from(
      res.getProxiedRemoteAddressAsText()
    ).toString()
    const remoteAddress = Buffer.from(res.getRemoteAddressAsText()).toString()

    return { method, url, query, headers, proxyRemoteAddress, remoteAddress }
  }

  protected async getClientData(transportData: any) {
    const declaration = this.options.clientProvider(transportData)
    const clientData = this.options.clientProvider
      ? await this.application.container.resolve(declaration)
      : undefined
    return clientData
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

  protected handleHttpResponse(
    req: Req,
    res: Res,
    headers: Headers,
    data: any
  ) {
    res.writeHeader(CONTENT_TYPE_HEADER, JSON_CONTENT_TYPE_MIME)
    res.end(toJSON(data))
  }

  protected handleHttpStreamResponse(
    req: Req,
    res: Res,
    headers: Headers,
    stream: Readable
  ) {
    let isAborted = false
    let isFirstChunk = true
    const tryRespond = (cb) => !isAborted && res.cork(cb)
    res.onAborted(() => {
      isAborted = true
      stream.destroy(new Error('Aborted by client'))
    })
    stream.on('error', () => tryRespond(() => res.close()))
    stream.on('end', () =>
      tryRespond(() => {
        if (stream instanceof JsonStreamResponse) {
          const end = encodeText('\n]')
          res.end(end)
        } else {
          res.end()
        }
      })
    )
    stream.on('data', (chunk) => {
      if (stream instanceof JsonStreamResponse) {
        // wrap all data into array, so any http client
        // can consume it as json array
        chunk = encodeText((isFirstChunk ? '' : ',') + '\n' + chunk)
        if (isFirstChunk) isFirstChunk = false
      }
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
    res.writeHeader(CORS_EXPOSE_HEADERS_HEADER, STREAM_DATA_TYPE_HEADER)
    res.writeHeader(STREAM_DATA_TYPE_HEADER, streamType)
    if (stream instanceof JsonStreamResponse) {
      // wrap all data into array, so any http client
      // can consume it as json array
      tryRespond(() => {
        res.writeHeader(CONTENT_TYPE_HEADER, JSON_CONTENT_TYPE_MIME)
        res.write(encodeText('['))
      })
    }
  }

  protected handleDefaultHeaders(req: Req, res: Res) {
    const headers = this.getRequestHeaders(req)
    this.setDefaultHeaders(res)
    this.setCors(res, headers)
  }

  protected getRequestHeaders(req: Req) {
    const headers = {}
    req.forEach((key, value) => (headers[key] = value))
    return headers
  }

  protected setDefaultHeaders(res: Res) {
    for (const [key, value] of Object.entries(HEADERS))
      res.writeHeader(key, value)
  }

  protected getRequestUrl(req: Req) {
    return new URL(
      req.getUrl(),
      'http://' + (req.getHeader('host') || 'unknown')
    )
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
