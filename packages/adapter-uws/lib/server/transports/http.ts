import { ApiError, ErrorCode, Scope } from '@neemata/common'
import qs from 'qs'
import { Readable } from 'stream'
import { AdapterCallContext, Transport } from '../../types'
import {
  CONTENT_TYPE_HEADER,
  Headers,
  InternalError,
  JSON_CONTENT_TYPE_MIME,
  Req,
  Res,
  Server,
  getBody,
  getRequestHeaders,
  getRequestUrl,
  setDefaultHeaders,
  toJSON,
} from '../index'

export type Callback = (...args: any[]) => any

export class HttpTransport {
  constructor(private readonly adapter: Server) {}

  get logger() {
    return this.adapter.logger
  }

  bind() {
    this.adapter.httpAdapter.post(
      this.adapter.basePath('api', '*'),
      this.handle.bind(this)
    )
    this.adapter.httpAdapter.get(
      this.adapter.basePath('api', '*'),
      this.handle.bind(this)
    )
    this.adapter.httpAdapter.get(
      this.adapter.basePath('health'),
      (res, req) => {
        if (!this.adapter.httpSocket) return void res.close()
        const headers = getRequestHeaders(req)
        setDefaultHeaders(res)
        this.adapter.setCors(res, headers)
        res.end('OK')
      }
    )
    this.adapter.httpAdapter.options(this.adapter.basePath('*'), (res, req) => {
      if (!this.adapter.httpSocket) return void res.close()
      const headers = getRequestHeaders(req)
      setDefaultHeaders(res)
      this.adapter.setCors(res, headers)
      if (req.getUrl().startsWith(this.adapter.basePath('api')))
        res.writeHeader('Accept', JSON_CONTENT_TYPE_MIME)
      res.writeStatus('204 No Content')
      res.endWithoutBody()
    })
    this.adapter.httpAdapter.any('/*', (res, req) => {
      if (!this.adapter.httpSocket) return void res.close()
      const headers = getRequestHeaders(req)
      setDefaultHeaders(res)
      this.adapter.setCors(res, headers)
      res.writeStatus('404 Not Found')
      res.end('Not Found')
    })
  }

  private async handle(res: Res, req: Req) {
    if (!this.adapter.httpSocket) return void res.close()

    let isAborted = false
    res.onAborted(() => (isAborted = true))

    const tryRespond = (cb: Callback) => {
      if (!isAborted) res.cork(cb)
    }

    const method = req.getMethod()
    const url = getRequestUrl(req)
    const query = qs.parse(req.getQuery(), this.adapter.options.qsOptions)
    const headers = getRequestHeaders(req)
    const proxyRemoteAddress = Buffer.from(
      res.getProxiedRemoteAddressAsText()
    ).toString()
    const remoteAddress = Buffer.from(res.getRemoteAddressAsText()).toString()

    try {
      const procedureName = url.pathname.substring(
        this.adapter.basePath('api').length + 1
      )
      const body = await this.bodyHandler(req, res, method, query)
      const resHeaders = new Map<string, string>()
      const setResponseHeader = (name: string, value: string) =>
        resHeaders.set(name, value)

      const context: AdapterCallContext = {
        headers,
        query,
        proxyRemoteAddress,
        remoteAddress,
        transport: Transport.Http,
        procedure: procedureName,
        method: method as 'post' | 'get',
        setResponseHeader,
      }

      const container = this.adapter.application.container.copy(
        Scope.Call,
        context
      )

      const response = await this.adapter.handleRPC(
        procedureName,
        container,
        body,
        context
      )
      const isStream = response instanceof Readable
      tryRespond(() => {
        this.adapter.setCors(res, headers)
        setDefaultHeaders(res)
        res.writeHeader(CONTENT_TYPE_HEADER, JSON_CONTENT_TYPE_MIME)
        for (const [name, value] of resHeaders) res.writeHeader(name, value)
        if (isStream) this.handleStreamResponse(req, res, headers, response)
        else this.handleResponse(req, res, headers, { response })
      })

      this.adapter.handleDisposal(container)
    } catch (error) {
      tryRespond(() => {
        setDefaultHeaders(res)
        this.adapter.setCors(res, headers)
        res.writeHeader(CONTENT_TYPE_HEADER, JSON_CONTENT_TYPE_MIME)
        if (error instanceof ApiError) {
          this.handleResponse(req, res, headers, { error })
        } else {
          this.logger.error(new Error('Unexpected error', { cause: error }))
          res.writeStatus('500 Internal Adapter Error')
          this.handleResponse(req, res, headers, { error: InternalError() })
        }
      })
    }
  }

  private async bodyHandler(req: Req, res: Res, method: string, query: any) {
    if (method === 'post') {
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

  private handleResponse(req: Req, res: Res, headers: Headers, data: any) {
    res.end(toJSON(data))
  }

  private handleStreamResponse(
    req: Req,
    res: Res,
    headers: Headers,
    stream: Readable
  ) {
    let isAborted = false
    const tryRespond = (cb) => {
      if (!isAborted) res.cork(cb)
    }
    stream.on('error', () => tryRespond(() => res.close()))
    res.onAborted(() => {
      isAborted = true
      stream.destroy(new Error('Aborted by client'))
    })
    stream.on('end', () => tryRespond(() => res.end()))
    stream.on('data', (chunk) => {
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
  }
}
