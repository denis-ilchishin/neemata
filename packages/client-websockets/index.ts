import {
  ApiError,
  BaseClient,
  Call,
  ErrorCode,
  ResolveProcedureApiType,
  Stream,
  concat,
  decodeNumber,
  decodeText,
  encodeNumber,
  encodeText,
} from '@neemata/common'
import { once } from 'events'
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

// to make private keys
const KEY: Record<MessageType, symbol> = Object.fromEntries(
  Object.values(MessageType).map((type) => [type as any, Symbol()])
)

class WebsocketsClient<Api extends any = never> extends BaseClient<
  Api,
  RPCOptions
> {
  private readonly url: URL
  private ws: WebSocket
  private autoreconnect: boolean
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
    this.emit('healthy')
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
      this.emit('open')
      this.attempts = 0
    }
    this.ws.onclose = (event) => {
      this.isConnected = false
      this.isHealthy = false
      this.emit('close')
      this.clear()
      if (this.autoreconnect) this.connect()
    }
    this.ws.onerror = (event) => {
      this.isHealthy = false
    }
    await once(this, 'open')
    this.emit('connect')
  }

  async disconnect() {
    this.autoreconnect = false
    this.ws.close(1000)
    await once(this, 'close')
  }

  async reconnect(urlParams?: URLSearchParams) {
    await this.disconnect()
    if (urlParams) this.setGetParams(urlParams)
    await this.connect()
  }

  async rpc<P extends keyof Api>(
    procedure: P,
    ...args: Api extends never
      ? [any?, RPCOptions?]
      : null extends ResolveProcedureApiType<Api, P, 'input'>
      ? [ResolveProcedureApiType<Api, P, 'input'>?, RPCOptions?]
      : [ResolveProcedureApiType<Api, P, 'input'>, RPCOptions?]
  ): Promise<
    Api extends never ? any : ResolveProcedureApiType<Api, P, 'output'>
  > {
    const [payload, options = {}] = args
    const { timeout = options.timeout } = options
    const callId = ++this.callId
    const streams = []
    const replacer = (key: string, value: any) => {
      if (value instanceof Stream) {
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

    if (!this.isConnected) await once(this, 'connect')

    return new Promise((resolve, reject) => {
      this.calls.set(callId, { resolve, reject, timer })
      this.send(MessageType.Rpc, data)
    })
  }

  setGetParams(params: URLSearchParams) {
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
      clearTimeout(timer)
      reject(error)
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
      clearTimeout(timer)
      this.calls.delete(callId)
      if (error) reject(new ApiError(error.code, error.message, error.data))
      else resolve(response)
    }
  }

  async [KEY[MessageType.ClientStreamPull]](buffer: ArrayBuffer) {
    console.log([buffer.byteLength])
    const id = decodeNumber(buffer, 'Uint32')
    const size = decodeNumber(buffer, 'Uint32', Uint32Array.BYTES_PER_ELEMENT)
    const stream = this.streams.client.get(id)
    const { done, chunk } = await stream._read(size)
    if (done) {
      this.send(MessageType.ClientStreamEnd, encodeNumber(id, 'Uint32'))
    } else {
      this.send(
        MessageType.ClientStreamPush,
        concat(encodeNumber(id, 'Uint32'), chunk)
      )
    }
  }

  async [KEY[MessageType.ClientStreamEnd]](buffer: ArrayBuffer) {
    const id = decodeNumber(buffer, 'Uint32')
    const stream = this.streams.client.get(id)
    stream._finish()
    this.streams.client.delete(id)
  }

  [KEY[MessageType.ClientStreamAbort]](buffer: ArrayBuffer) {
    const id = decodeNumber(buffer, 'Uint32')
    const stream = this.streams.client.get(id)
    stream.destroy(new Error('Aborted by server'))
    this.streams.client.delete(id)
  }
}
