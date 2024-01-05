import {
  AbortStreamError,
  ApiError,
  BaseClient,
  Call,
  DownStream,
  ErrorCode,
  EventsType,
  ResolveApiProcedureType,
  StreamDataType,
  StreamMetadata,
  UpStream,
  concat,
  decodeNumber,
  decodeText,
  encodeNumber,
  encodeText,
  once,
} from '@neemata/common'
import { MessageType } from '../transport-websockets/lib/common'

export { ApiError, ErrorCode, WebsocketsClient }

type Options = {
  host: string
  secure?: boolean
  timeout?: number
  autoreconnect?: boolean
  debug?: boolean
}

type RPCOptions = {
  timeout?: number
}

// to make dynamic private keys
const KEY: Record<MessageType, symbol> = Object.fromEntries(
  Object.values(MessageType).map((type) => [type as any, Symbol()])
)

class WebsocketsClient<
  Procedures extends any = never,
  Events extends EventsType = never
> extends BaseClient<Procedures, Events, RPCOptions> {
  private readonly url: URL
  private ws!: WebSocket
  private autoreconnect!: boolean
  private URLParams: URLSearchParams = new URLSearchParams()
  private isHealthy = false
  private isConnected = false
  private attempts = 0
  private callId = 0
  private calls = new Map<number, Call>()

  constructor(private readonly options: Options) {
    super()
    this.url = new URL(`${options.secure ? 'wss' : 'ws'}://${options.host}`)
  }

  async healthCheck() {
    while (!this.isHealthy) {
      try {
        const signal = AbortSignal.timeout(5000)
        const url = new URL('health', this.url)
        url.protocol = this.options.secure ? 'https' : 'http'
        const { ok } = await fetch(url, { signal })
        this.isHealthy = ok
      } catch (e) {}

      if (!this.isHealthy) {
        this.attempts++
        const seconds = Math.min(this.attempts, 15)
        await new Promise((r) => setTimeout(r, seconds * 1000))
      }
    }
    this.emit('_neemata:healthy')
  }

  async connect() {
    this.autoreconnect = this.options.autoreconnect ?? true // reset default autoreconnect value
    await this.healthCheck()

    this.ws = new WebSocket(this.applyURLParams(new URL('api', this.url)))
    this.ws.binaryType = 'arraybuffer'

    this.ws.onmessage = (event) => {
      const buffer: ArrayBuffer = event.data
      const type = decodeNumber(buffer, 'Uint8')
      const handler = this[KEY[type]]
      if (handler) {
        handler.call(this, buffer.slice(Uint8Array.BYTES_PER_ELEMENT), this.ws)
      }
    }
    this.ws.onopen = (event) => {
      this.isConnected = true
      this.emit('_neemata:open')
      this.attempts = 0
    }
    this.ws.onclose = (event) => {
      this.isConnected = false
      this.isHealthy = false
      this.emit('_neemata:close')
      this.clear(
        event.code === 1000 ? undefined : new Error('Connection closed')
      )
      if (this.autoreconnect) this.connect()
    }
    this.ws.onerror = (event) => {
      this.isHealthy = false
    }
    await once(this, 'neemata:open')
    this.emit('_neemata:connect')
  }

  async disconnect() {
    this.autoreconnect = false
    this.ws.close(1000)
    await once(this, 'close')
  }

  async reconnect(urlParams?: URLSearchParams) {
    await this.disconnect()
    if (urlParams) this.setURLParams(urlParams)
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
    const { timeout = options.timeout } = options
    const callId = ++this.callId
    const streams: [number, StreamMetadata][] = []
    const replacer = (key: string, value: any) => {
      if (value instanceof UpStream) {
        streams.push([value.id, value.metadata])
        return value._serialize()
      }
      return value
    }
    const rpcPayload = encodeText(
      JSON.stringify([callId, procedure, payload], replacer)
    )
    const streamsData = encodeText(JSON.stringify(streams))
    const streamDataLength = encodeNumber(streamsData.byteLength, 'Uint32')
    const data = concat(streamDataLength, streamsData, rpcPayload)
    const timer = setTimeout(() => {
      const call = this.calls.get(callId)
      if (call) {
        const { reject } = call
        reject(new ApiError(ErrorCode.RequestTimeout, 'Request timeout'))
        this.calls.delete(callId)
      }
    }, timeout || 30000)

    if (!this.isConnected) await once(this, 'neemata:connect')

    return new Promise((resolve, reject) => {
      this.calls.set(callId, { resolve, reject, timer })
      this.send(MessageType.Rpc, data)
    })
  }

  setURLParams(params: URLSearchParams) {
    this.URLParams = params
  }

  private applyURLParams(url: URL) {
    for (const [key, value] of this.URLParams.entries())
      url.searchParams.set(key, value)
    return url
  }

  private async clear(error?: Error) {
    for (const call of this.calls.values()) {
      const { reject, timer } = call
      if (timer) clearTimeout(timer)
      reject(error)
    }

    for (const stream of this.streams.up.values()) {
      stream.destroy(error)
    }

    for (const stream of this.streams.down.values()) {
      stream.ac.abort(error)
    }

    this.calls.clear()
  }

  private async send(type: MessageType, ...payload: ArrayBuffer[]) {
    this.ws.send(concat(encodeNumber(type, 'Uint8'), ...payload))
  }

  [KEY[MessageType.Event]](buffer: ArrayBuffer) {
    const [event, payload] = JSON.parse(decodeText(buffer))
    this.emit(event, payload)
  }

  [KEY[MessageType.Rpc]](buffer: ArrayBuffer) {
    const [callId, response, error] = JSON.parse(decodeText(buffer))
    const call = this.calls.get(callId)
    if (call) {
      const { resolve, reject, timer } = call
      if (timer) clearTimeout(timer)
      this.calls.delete(callId)
      if (error) reject(new ApiError(error.code, error.message, error.data))
      else resolve(response)
    }
  }

  [KEY[MessageType.RpcStream]](buffer: ArrayBuffer) {
    const [callId, streamDataType, streamId, payload] = JSON.parse(
      decodeText(buffer)
    )
    const call = this.calls.get(callId)
    if (call) {
      const ac = new AbortController()
      ac.signal.addEventListener(
        'abort',
        () => {
          this.streams.down.delete(streamId)
          this.send(
            MessageType.ServerStreamAbort,
            encodeNumber(streamId, 'Uint32')
          )
        },
        { once: true }
      )
      const transformer = transformers[streamDataType]
      const stream = new DownStream(transformer, ac)
      this.streams.down.set(streamId, stream)
      const { resolve, timer } = call
      if (timer) clearTimeout(timer)
      this.calls.delete(callId)
      resolve({ payload, stream: stream.interface })
    } else {
      this.send(MessageType.ServerStreamAbort, encodeNumber(streamId, 'Uint32'))
    }
  }

  async [KEY[MessageType.ClientStreamPull]](buffer: ArrayBuffer) {
    const id = decodeNumber(buffer, 'Uint32')
    const size = decodeNumber(buffer, 'Uint32', Uint32Array.BYTES_PER_ELEMENT)
    const stream = this.streams.up.get(id)
    if (!stream) throw new Error('Stream not found')
    const { done, chunk } = await stream._read(size)
    if (done) {
      this.send(MessageType.ClientStreamEnd, encodeNumber(id, 'Uint32'))
    } else {
      this.send(
        MessageType.ClientStreamPush,
        concat(encodeNumber(id, 'Uint32'), chunk!)
      )
    }
  }

  async [KEY[MessageType.ClientStreamEnd]](buffer: ArrayBuffer) {
    const id = decodeNumber(buffer, 'Uint32')
    const stream = this.streams.up.get(id)
    if (!stream) throw new Error('Stream not found')
    stream._finish()
    this.streams.up.delete(id)
  }

  [KEY[MessageType.ClientStreamAbort]](buffer: ArrayBuffer) {
    const id = decodeNumber(buffer, 'Uint32')
    const stream = this.streams.up.get(id)
    if (!stream) throw new Error('Stream not found')
    stream.destroy(new AbortStreamError('Aborted by server'))
    this.streams.up.delete(id)
  }

  async [KEY[MessageType.ServerStreamPush]](buffer: ArrayBuffer) {
    const streamId = decodeNumber(buffer, 'Uint32')
    const stream = this.streams.down.get(streamId)
    if (stream) {
      await stream.writer.write(
        new Uint8Array(buffer.slice(Uint32Array.BYTES_PER_ELEMENT))
      )
      this.send(MessageType.ServerStreamPull, encodeNumber(streamId, 'Uint32'))
    }
  }

  [KEY[MessageType.ServerStreamEnd]](buffer: ArrayBuffer) {
    const streamId = decodeNumber(buffer, 'Uint32')
    const stream = this.streams.down.get(streamId)
    if (stream) stream.writer.close()
    this.streams.down.delete(streamId)
  }

  [KEY[MessageType.ServerStreamAbort]](buffer: ArrayBuffer) {
    const streamId = decodeNumber(buffer, 'Uint32')
    const stream = this.streams.down.get(streamId)
    if (stream) stream.writable.abort(new AbortStreamError('Aborted by server'))
    this.streams.down.delete(streamId)
  }
}

const transformers: Record<StreamDataType, Transformer['transform']> = {
  [StreamDataType.Json]: (chunk, controller) =>
    controller.enqueue(JSON.parse(decodeText(chunk))),
  [StreamDataType.Binary]: (chunk, controller) => controller.enqueue(chunk),
} as const
