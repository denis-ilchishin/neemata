import {
  ApiError,
  Container,
  Dependencies,
  ErrorCode,
  ExtensionInstallOptions,
  LoaderInterface,
  ProcedureDeclaration,
  defer,
} from '@neemata/application'
import { resolve } from 'node:path'
import { PassThrough, Readable } from 'node:stream'
import uws from 'uWebSockets.js'
import type { Adapter } from '../adapter'
import {
  AdapterCallContext,
  AdapterConnectionContext,
  AdapterContext,
  AdapterProcedureOptions,
  Room,
  WebSocketInterface,
} from '../types'
import { HttpTransport } from './transports/http'
import { WsTransport } from './transports/ws'

export type Headers = Record<string, string>
export type Req = uws.HttpRequest
export type Res = uws.HttpResponse
export type WebSocketUserData = {
  id: string
  streams: Map<number, Readable>
  container: Container<
    LoaderInterface<
      ProcedureDeclaration<
        Dependencies,
        AdapterProcedureOptions,
        AdapterContext,
        any,
        any,
        any
      >
    >,
    AdapterContext
  >
  context: AdapterConnectionContext
}

export type WebSocket = uws.WebSocket<WebSocketUserData>

export const AUTH_KEY = Symbol('auth')
export const HTTP_SUFFIX = '\r\n\r\n'
export const CONTENT_TYPE_HEADER = 'Content-Type'
export const CHARSET_SUFFIX = 'charset=utf-8'
export const JSON_CONTENT_TYPE_MIME = 'application/json'
export const PLAIN_CONTENT_TYPE_MIME = 'text/plain'
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

export class Server {
  httpAdapter: uws.TemplatedApp
  httpSocket!: uws.us_listen_socket

  readonly websockets = new Map<string, WebSocketInterface>()
  readonly rooms = new Map<string, Room>()

  constructor(
    readonly options: Adapter['options'],
    readonly application: ExtensionInstallOptions<
      AdapterProcedureOptions,
      AdapterContext
    >
  ) {
    this.httpAdapter = options.https ? uws.SSLApp(options.https) : uws.App()
    new HttpTransport(this).bind()
    new WsTransport(this).bind()
  }

  get logger() {
    return this.application.logger
  }

  basePath(...parts: string[]) {
    return '/' + parts.join('/')
  }

  setCors(res: Res, headers: Headers) {
    //TODO: configurable cors
    const origin = headers['origin']
    if (origin) res.writeHeader('Access-Control-Allow-Origin', origin)
  }

  async handleRPC(
    name: string,
    container: this['application']['container'],
    payload: any,
    context: AdapterCallContext
  ) {
    this.logger.debug('Call [%s] procedure...', name)
    const declaration = await this.application.api.find(name)
    if (
      declaration.procedure.transport &&
      declaration.procedure.transport !== context.transport
    ) {
      throw new ApiError(
        ErrorCode.NotAcceptable,
        `Procedure ${name} does not support ${context.transport} transport`
      )
    }
    return this.application.api.call(name, declaration, payload, container, {
      request: context,
    })
  }

  handleDisposal(container: this['application']['container']) {
    defer(() =>
      container.dispose().catch((cause) =>
        this.logger.error(
          new Error('Error while container disposal (potential memory leak)', {
            cause,
          })
        )
      )
    )
  }

  async start() {
    const { hostname, port, https } = this.options
    this.httpSocket = await new Promise((r) => {
      if (hostname.startsWith('unix:')) {
        this.httpAdapter.listen_unix(r, resolve(hostname.slice(5)))
      } else if (typeof port !== 'string') {
        this.httpAdapter.listen(hostname, port, r)
      }
    })
    this.logger.info(
      'Listening on %s://%s:%s',
      https ? 'https' : 'http',
      hostname,
      port
    )
  }

  async stop() {
    if (!this.httpSocket) return
    uws.us_listen_socket_close(this.httpSocket)
    this.httpSocket = undefined
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

export const setDefaultHeaders = (res: Res) => {
  for (const [key, value] of Object.entries(HEADERS))
    res.writeHeader(key, value)
}

export const getRequestUrl = (req: Req) => {
  return new URL(req.getUrl(), 'http://' + (req.getHeader('host') || 'unknown'))
}

export const getRequestHeaders = (req: Req) => {
  const headers = {}
  req.forEach((key, value) => (headers[key] = value))
  return headers
}
