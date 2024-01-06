import {
  ApiError,
  BaseClient,
  DownStream,
  ErrorCode,
  ResolveApiProcedureType,
  StreamDataType,
  concat,
  decodeText,
  encodeText,
} from '@neemata/common'

export { ApiError, ErrorCode, HttpClient }

type Options = {
  host: string
  secure?: boolean
  timeout?: number
  debug?: boolean
}

type RPCOptions = {
  timeout?: number
  URLParams?: URLSearchParams
  headers?: Record<string, string>
}

class HttpClient<
  Procedures extends any = never,
  Events extends Record<string, any> = Record<string, any>
> extends BaseClient<Procedures, Events, RPCOptions> {
  private readonly url: URL
  private URLParams: URLSearchParams = new URLSearchParams()
  private headers: Record<string, string> = {}

  constructor(private readonly options: Options) {
    super()
    const schema = options.secure ? 'https' : 'http'
    this.url = new URL(`${schema}://${options.host}`)
  }

  async connect() {
    return void 0
  }

  async disconnect() {
    return void 0
  }

  async reconnect(
    URLParams?: URLSearchParams,
    headers?: Record<string, string>
  ) {
    await this.disconnect()
    if (URLParams) this.setURLParams(URLParams)
    if (headers) this.setHeaders(headers)
    await this.connect()
  }

  async rpc<P extends keyof Procedures>(
    procedure: P,
    ...args: Procedures extends never
      ? [any?, RPCOptions?]
      : null extends ResolveApiProcedureType<Procedures, P, 'input'>
      ? [ResolveApiProcedureType<Procedures, P, 'input'>?, RPCOptions?]
      : [ResolveApiProcedureType<Procedures, P, 'input'>, RPCOptions?]
  ): Promise<
    Procedures extends never
      ? any
      : ResolveApiProcedureType<Procedures, P, 'output'>
  > {
    const [payload, options = {}] = args
    const { timeout = options.timeout, headers = {}, URLParams } = options
    const ac = new AbortController()
    const signal = timeout ? AbortSignal.timeout(timeout) : undefined
    if (signal) {
      // TODO: AbortSignal.any not yet fully supported
      // https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/any_static
      signal.addEventListener('abort', () => ac.abort(new Error('Timeout')), {
        once: true,
      })
    }
    return await fetch(
      this.applyURLParams(
        new URL(`api/${procedure as string}`, this.url),
        URLParams
      ),
      {
        signal: ac.signal,
        method: 'POST',
        body: JSON.stringify(payload),
        credentials: 'include',
        cache: 'no-cache',
        headers: {
          'Content-Type': 'application/json',
          'X-Neemata-Stream-Protocol-Support': '1',
          ...this.headers,
          ...headers,
        },
      }
    ).then(async (res) => {
      const streamType = res.headers.get('X-Neemata-Stream-Data-Type')
      if (streamType) {
        let payloadCallback
        const payloadLength = parseInt(
          res.headers.get('X-Neemata-Stream-Payload-Length')!
        )
        // Promise.withResolvers() not yet widely supported https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/withResolvers
        const payload = new Promise((resolve) => (payloadCallback = resolve))
        const transformer = transformers[streamType](
          payloadCallback,
          payloadLength
        )
        const stream = new DownStream(transformer, ac)
        stream.writer.releaseLock()
        res.body!.pipeTo(stream.writable)
        stream.reader.read()
        return { stream: stream.interface, payload: await payload }
      } else
        return res.json().then(({ response, error }) => {
          if (error) throw new ApiError(error.code, error.message, error.data)
          return response
        })
    })
  }

  setURLParams(params: URLSearchParams) {
    this.URLParams = params
  }

  setHeaders(headers: Record<string, string>) {
    this.headers = headers
  }

  private applyURLParams(url: URL, params?: URLSearchParams) {
    for (const [key, value] of this.URLParams.entries())
      url.searchParams.set(key, value)
    if (params)
      for (const [key, value] of params.entries())
        url.searchParams.set(key, value)
    return url
  }
}

const transformers: Record<
  StreamDataType,
  (...args: any[]) => Transformer['transform']
> = {
  [StreamDataType.Json]: (resolvePayload) => {
    let buffer: ArrayBuffer
    let payloadEmited = false

    const decode = () => {
      let text = decodeText(buffer)
      const lines = text.split('\n')
      const lastLine = lines.pop()
      if (!payloadEmited && lines.length) {
        resolvePayload(JSON.parse(lines.shift()!))
        payloadEmited = true
      }
      buffer = lastLine ? encodeText(lastLine + '\n') : new ArrayBuffer(0)
      return lines.map((line) => JSON.parse(line))
    }

    const transform: Transformer['transform'] = (chunk, controller) => {
      buffer = buffer ? concat(buffer, chunk.buffer) : chunk.buffer
      for (const decodedChunk of decode()) controller.enqueue(decodedChunk)
    }

    return transform
  },
  [StreamDataType.Binary]: (resolvePayload, payloadLength) => {
    let buffer: ArrayBuffer
    let payloadEmited = false

    return (chunk, controller) => {
      if (!payloadEmited) {
        buffer = buffer ? concat(buffer, chunk.buffer) : chunk.buffer
        if (buffer.byteLength >= payloadLength) {
          resolvePayload(JSON.parse(decodeText(buffer.slice(0, payloadLength))))
          payloadEmited = true
          controller.enqueue(buffer.slice(payloadLength))
        }
      } else {
        controller.enqueue(chunk)
      }
    }
  },
} as const
