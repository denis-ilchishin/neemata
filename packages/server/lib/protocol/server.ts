import {
  ApiError,
  ErrorCode,
  Transport,
  type StreamMeta,
} from '@neemata/common'
import EventEmitter from 'node:events'
import { Duplex, PassThrough, Readable } from 'node:stream'
import uws from 'uWebSockets.js'
import { Api } from '../api'
import { Config } from '../config'
import { Container } from '../container'

import { resolve } from 'node:path'
import { Semaphore, SemaphoreError } from '../utils/semaphore'
import { HttpTransport } from './transports/http'
import { WsTransport } from './transports/ws'

export type Stream = Readable & { meta: StreamMeta }
export type Headers = Record<string, string>
export type Req = uws.HttpRequest
export type Res = uws.HttpResponse
export type WebSocketUserData = {
  id: string
  streams: Map<string, Duplex>
  container: Container
  params: ConnectionScopeParams
  events: EventEmitter
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
export const InternalError = new ApiError(
  ErrorCode.InternalServerError,
  'Internal Server Error'
)

export const NotFoundError = new ApiError(ErrorCode.NotFound, 'Not Found')
export const ForbiddenError = new ApiError(ErrorCode.Forbidden, 'Forbidden')

export class Server {
  container: Container
  httpServer: uws.TemplatedApp
  httpSocket!: uws.us_listen_socket
  throttler?: Semaphore

  readonly websockets = new Map<string, WebSocketInterface>()
  readonly rooms = new Map<string, Room>()

  constructor(public readonly config: Config, public readonly api: Api) {
    this.httpServer = config.https ? uws.SSLApp(config.https) : uws.App()

    if (config.api?.queue) {
      const { concurrency, size, timeout } = config.api.queue
      this.throttler = new Semaphore(concurrency, size, timeout)
    }

    new HttpTransport(this).bind()
    new WsTransport(this).bind()
  }

  basePath(...parts: string[]) {
    return '/' + parts.join('/')
  }

  setCors(res: Res, headers: Headers) {
    const origin = headers['origin']
    if (origin) res.writeHeader('Access-Control-Allow-Origin', origin)
  }

  setGlobalContainer(container: Container) {
    this.container = container
  }

  async throttle(cb: AnyFunction) {
    if (!this.throttler) return cb()
    try {
      await this.throttler.enter()
      return await cb()
    } catch (error) {
      if (error instanceof SemaphoreError)
        throw new ApiError(ErrorCode.ServiceUnavailable, 'Server is too busy')
      else throw error
    } finally {
      this.throttler.leave()
    }
  }

  async handleRPC(
    procedureName: string,
    container: Container,
    payload: any,
    transport: Transport,
    params: any = {}
  ) {
    this.config.logger.debug('Handling [%s] procedure...', procedureName)
    try {
      return await this.throttle(async () => {
        const procedure = await this.api.resolveProcedure(
          container,
          procedureName,
          transport
        )
        if (!procedure) {
          throw new ApiError(ErrorCode.NotFound, 'Procedure not found')
        }
        const { guards, handle, input, output } = procedure
        const resolvedGuards = guards ? await guards(payload, params) : null
        if (resolvedGuards) await this.handleGuards(resolvedGuards)
        const data = input ? await input(payload, params) : payload
        const response = await handle(data, params)
        return output ? await output(response) : response
      })
    } catch (error) {
      throw this.api.handleError(error)
    }
  }

  async handleGuards(guards: Guard[] | undefined) {
    if (guards) {
      for (const guard of guards) {
        try {
          const permitted = await guard()
          if (permitted) throw ForbiddenError
        } catch (error) {
          if (error instanceof ApiError) throw error
          else {
            this.config.logger.warn('Guard throwed unexpected error', {
              cause: error,
            })
            throw ForbiddenError
          }
        }
      }
    }
  }

  async start() {
    const { hostname, port } = this.config
    this.httpSocket = await new Promise((r) => {
      if (hostname.startsWith('unix:')) {
        this.httpServer.listen_unix(r, resolve(hostname.slice(5)))
      } else if (typeof port !== 'string') {
        this.httpServer.listen(hostname, port, r)
      }
    })
    this.config.logger.info(
      'Listening on %s://%s:%s',
      this.config.https ? 'https' : 'http',
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
