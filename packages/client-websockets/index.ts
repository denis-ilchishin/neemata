import {
  AbortStreamError,
  ApiError,
  BaseClient,
  type Call,
  DownStream,
  ErrorCode,
  type EventsType,
  type ResolveApiProcedureType,
  StreamDataType,
  type StreamMetadata,
  Subscription,
  UpStream,
  concat,
  decodeNumber,
  decodeText,
  encodeNumber,
  encodeText,
  once,
} from '@neematajs/common'

import {
  HttpPayloadGetParam,
  MessageType,
} from '../transport-websockets/lib/common'

export {
  ApiError,
  DownStream,
  ErrorCode,
  Subscription,
  UpStream,
  WebsocketsClient,
  type StreamMetadata,
}

type Options = {
  host: string
  secure?: boolean
  timeout?: number
  autoreconnect?: boolean
  debug?: boolean
  WebSocket?: new (...args: any[]) => WebSocket
}

type RPCOptions = {
  timeout?: number
}

type HTTPRPCOptions = RPCOptions & {
  URLParams?: URLSearchParams
  headers?: Record<string, string>
}

// TODO: to make dynamic private keys... is it really necessary?
const KEY: Record<MessageType, symbol> = Object.fromEntries(
  Object.values(MessageType).map((type) => [type as any, Symbol()]),
)

class WebsocketsClient<
  Procedures = never,
  Events extends EventsType = never,
> extends BaseClient<Procedures, Events, RPCOptions> {
  private ws!: WebSocket
  private autoreconnect!: boolean
  private URLParams: URLSearchParams = new URLSearchParams()
  private isHealthy = false
  private isConnected = false
  private attempts = 0
  private callId = 0
  private calls = new Map<number, Call>()
  private subscriptions = new Map<string, Subscription>()

  constructor(private readonly options: Options) {
    super()
  }

  async healthCheck() {
    while (!this.isHealthy) {
      try {
        const signal = AbortSignal.timeout(10000)
        const url = this.getURL('health', 'http')
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

    this.ws = new (this.options.WebSocket ?? globalThis.WebSocket)(
      this.getURL('api', 'ws'),
    )
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
        event.code === 1000
          ? undefined
          : new Error('Connection closed with code ' + event.code),
      )
      if (this.autoreconnect) this.connect()
    }
    this.ws.onerror = (event) => {
      this.isHealthy = false
    }
    await once(this, '_neemata:open')
    this.emit('_neemata:connect')
  }

  async disconnect() {
    this.autoreconnect = false
    const closing = once(this, '_neemata:close')
    this.ws?.close(1000)
    await closing
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
      JSON.stringify([callId, procedure, payload], replacer),
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

    if (!this.isConnected) await once(this, '_neemata:connect')

    return new Promise((resolve, reject) => {
      this.calls.set(callId, { resolve, reject, timer })
      this.send(MessageType.Rpc, data)
    })
  }

  async rpcHttp<P extends keyof Procedures>(
    procedure: P,
    ...args: Procedures extends never
      ? [any?, HTTPRPCOptions?]
      : null extends ResolveApiProcedureType<Procedures, P, 'input'>
        ? [ResolveApiProcedureType<Procedures, P, 'input'>?, HTTPRPCOptions?]
        : [ResolveApiProcedureType<Procedures, P, 'input'>, HTTPRPCOptions?]
  ): Promise<
    Procedures extends never
      ? any
      : ResolveApiProcedureType<Procedures, P, 'output'>
  > {
    const [payload, options = {}] = args
    const { timeout = options.timeout, headers = {}, URLParams } = options
    const ac = new AbortController()
    const timeoutSignal = timeout ? AbortSignal.timeout(timeout) : undefined
    if (timeoutSignal) {
      // TODO: AbortSignal.any not yet fully supported
      // https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/any_static
      timeoutSignal.addEventListener(
        'abort',
        () => ac.abort(new Error('Timeout')),
        {
          once: true,
        },
      )
    }

    return await fetch(
      this.getURL(`api/${procedure as string}`, 'http', URLParams),
      {
        signal: ac.signal,
        method: 'POST',
        body: JSON.stringify(payload),
        credentials: 'include',
        cache: 'no-cache',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...headers,
        },
      },
    )
      .then((res) => res.json())
      .then(({ response, error }) => {
        if (error) throw new ApiError(error.code, error.message, error.data)
        return response
      })
  }

  url<P extends keyof Procedures>(
    procedure: P,
    ...args: Procedures extends never
      ? [any?, HTTPRPCOptions?]
      : null extends ResolveApiProcedureType<Procedures, P, 'input'>
        ? [ResolveApiProcedureType<Procedures, P, 'input'>?, HTTPRPCOptions?]
        : [ResolveApiProcedureType<Procedures, P, 'input'>, HTTPRPCOptions?]
  ): URL {
    const [payload, options = {}] = args
    const { URLParams = new URLSearchParams() } = options
    URLParams.set(HttpPayloadGetParam, JSON.stringify(payload))
    return this.getURL(`api/${procedure as string}`, 'http', URLParams)
  }

  setURLParams(params: URLSearchParams) {
    this.URLParams = params
  }

  private getURL(path = '', protocol: 'ws' | 'http', params?: URLSearchParams) {
    const url = new URL(
      `${this.options.secure ? protocol + 's' : protocol}://${
        this.options.host
      }/${path}`,
    )
    for (const [key, value] of this.URLParams.entries())
      url.searchParams.set(key, value)

    if (params) {
      for (const [key, value] of params.entries())
        url.searchParams.set(key, value)
    }

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

    for (const subscription of this.subscriptions.values()) {
      subscription.unsubscribe()
    }

    this.calls.clear()
    this.streams.up.clear()
    this.streams.down.clear()
    this.subscriptions.clear()
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
      decodeText(buffer),
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
            encodeNumber(streamId, 'Uint32'),
          )
        },
        { once: true },
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

  [KEY[MessageType.RpcSubscription]](buffer: ArrayBuffer) {
    const [callId, key] = JSON.parse(decodeText(buffer))
    const call = this.calls.get(callId)
    if (call) {
      const { resolve, timer } = call
      if (timer) clearTimeout(timer)
      this.calls.delete(callId)
      const subscription = new Subscription(key, () => {
        subscription.emit('end')
        this.subscriptions.delete(key)
        this.send(
          MessageType.ClientUnsubscribe,
          encodeText(JSON.stringify([key])),
        )
      })
      this.subscriptions.set(key, subscription)
      resolve(subscription)
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
        concat(encodeNumber(id, 'Uint32'), chunk!),
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
        new Uint8Array(buffer.slice(Uint32Array.BYTES_PER_ELEMENT)),
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

  [KEY[MessageType.ServerSubscriptionEmit]](buffer: ArrayBuffer) {
    const [key, payload] = JSON.parse(decodeText(buffer))
    const subscription = this.subscriptions.get(key)
    if (subscription) subscription.emit('data', payload)
  }

  [KEY[MessageType.ServerUnsubscribe]](buffer: ArrayBuffer) {
    const [key] = JSON.parse(decodeText(buffer))
    const subscription = this.subscriptions.get(key)
    subscription?.unsubscribe()
  }
}

const transformers: Record<StreamDataType, Transformer['transform']> = {
  [StreamDataType.Json]: (chunk, controller) =>
    controller.enqueue(JSON.parse(decodeText(chunk))),
  [StreamDataType.Binary]: (chunk, controller) => controller.enqueue(chunk),
} as const
