import {
  ApiError,
  ErrorCode,
  MessageType,
  STREAM_ID_PREFIX,
  StreamMeta,
  concat,
  decodeNumber,
  decodeText,
  encodeNumber,
  encodeText,
} from '@neemata/common'
import { EventEmitter } from 'events'

type Options = {
  host: string
  https?: boolean
  basePath?: string
  timeout?: number
  autoreconnect?: boolean
  debug?: boolean
}

type Call = [
  (value?: any) => void,
  (reason?: any) => void,
  ReturnType<typeof setTimeout>
]

const once = <T = void>(emitter: EventEmitter, event: string, value?: T) =>
  new Promise<T>((r) => emitter.once(event, () => r(value)))

const STREAM_ID_KEY = Symbol()

const KEYS = {
  [MessageType.Rpc]: Symbol(),
  [MessageType.StreamPull]: Symbol(),
  [MessageType.StreamEnd]: Symbol(),
  [MessageType.StreamPull]: Symbol(),
  [MessageType.StreamTerminate]: Symbol(),
  [MessageType.Event]: Symbol(),
}

export { ApiError, ErrorCode, type StreamMeta } from '@neemata/common'

export class Client extends EventEmitter {
  private ws: WebSocket
  private autoreconnect: boolean
  private httpUrl: URL
  private wsUrl: URL

  private isHealthy = false
  private isConnected = false
  private nextReconnect = -1
  private nextStreamId = 1
  private nextCallId = 1
  private calls = new Map<number, Call>()
  private streams = new Map<number, Stream>()

  constructor(private readonly options: Options) {
    super()
    this.httpUrl = new URL(
      `${options.https ? 'https' : 'http'}://${options.host}`,
      options.basePath
    )
    this.wsUrl = new URL(
      options.basePath ?? '/',
      `${options.https ? 'wss' : 'ws'}://${options.host}`
    )
  }

  async healthCheck() {
    while (!this.isHealthy) {
      try {
        const { ok } = await fetch(`${this.httpUrl}health`)
        this.isHealthy = ok
      } catch (e) {}
      this.nextReconnect = Math.min(this.nextReconnect + 1, 10)
      await new Promise((r) => setTimeout(r, this.nextReconnect * 1000))
    }
    this.emit('healthy')
  }

  async connect() {
    this.autoreconnect = this.options.autoreconnect ?? true // reset default autoreconnect value
    await this.healthCheck()
    this.ws = new WebSocket(`${this.wsUrl}api`)
    this.ws.binaryType = 'arraybuffer'

    this.ws.onmessage = (event) => {
      const buffer: ArrayBuffer = event.data
      const type = decodeNumber(buffer, Uint8Array)
      if (this.options.debug)
        console.log(
          'Neemata: received message',
          Object.keys(MessageType).find((key) => MessageType[key] === type)
        )
      this[KEYS[type]](this.ws, buffer.slice(Uint8Array.BYTES_PER_ELEMENT))
    }
    this.ws.onopen = (event) => {
      this.isConnected = true
      this.emit('connect')
      this.nextReconnect = -1
    }
    this.ws.onclose = (event) => {
      this.isConnected = false
      this.isHealthy = false
      this.emit('disconnect')
      this.clear()
      if (this.autoreconnect) this.connect()
    }
    this.ws.onerror = (event) => {
      this.isHealthy = false
    }

    await once(this, 'connect')
  }

  async disconnect() {
    this.autoreconnect = false // disable autoreconnect if manually disconnected
    this.ws.close(1000)
    return await once(this, 'disconnect')
  }

  rpc<T>(
    procedure: string,
    payload?: any,
    options: {
      timeout?: number
      useHttp?: boolean
    } = {}
  ) {
    const { timeout = options.timeout, useHttp = false } = options
    const callId = this.nextCallId++
    const streams = []
    const callPayload = encodeText(
      JSON.stringify({ callId, procedure, payload }, (key, value) => {
        if (value && typeof value[STREAM_ID_KEY] === 'number') {
          const id = value[STREAM_ID_KEY]
          const meta = value.meta
          streams.push({ id, ...meta })
          return STREAM_ID_PREFIX + id
        }
        return value
      })
    )

    if (useHttp && streams.length)
      throw new Error('Unable to stream data over HTTP')

    if (useHttp) {
      return this.sendWithHttp(procedure, payload)
    } else {
      const streamsPayload = encodeText(JSON.stringify(streams))
      const streamDataLength = encodeNumber(
        streamsPayload.byteLength,
        Uint32Array
      )
      const data = concat(streamDataLength, streamsPayload, callPayload)

      const timer = setTimeout(() => {
        const call = this.calls.get(callId)
        if (call) {
          const reject = call[1]
          reject(new ApiError(ErrorCode.RequestTimeout, 'Request timeout'))
          this.calls.delete(callId)
        }
      }, timeout || 30000)

      return new Promise<T>((resolse, reject) => {
        this.calls.set(callId, [resolse, reject, timer])
        this.sendWithWs(MessageType.Rpc, data)
      })
    }
  }

  createStream(blob: Blob) {
    return new Stream(this, blob)
  }

  private async clear(error?: Error) {
    for (const call of this.calls.values()) {
      const [, reject, timer] = call
      clearTimeout(timer)
      reject(error)
    }
    this.calls.clear()

    for (const stream of this.streams.values()) stream.destroy(error)
    this.streams.clear()
  }

  private async sendWithWs(type: MessageType, payload: ArrayBuffer) {
    if (!this.isConnected) await once(this, 'connect')
    this.ws.send(concat(encodeNumber(type, Uint8Array), payload))
  }

  private async sendWithHttp(procedure: string, payload: any) {
    return fetch(`${this.httpUrl}api/${procedure}`, {
      method: 'POST',
      body: JSON.stringify(payload),
      credentials: 'include',
      cache: 'no-cache',
      headers: {
        'Content-Type': 'application/json',
      },
    })
      .then((res) => res.json())
      .then(({ response, error }) => {
        if (error) throw new ApiError(error.code, error.message, error.data)
        return response
      })
  }

  [KEYS[MessageType.Rpc]](ws: WebSocket, buffer: ArrayBuffer) {
    const { callId, payload } = JSON.parse(decodeText(buffer))
    const { error, response } = payload
    const call = this.calls.get(callId)
    if (call) {
      const [resolve, reject, timer] = call
      clearTimeout(timer)
      this.calls.delete(callId)
      if (error) reject(new ApiError(error.code, error.message, error.data))
      else resolve(response)
    }
  }

  [KEYS[MessageType.Event]](ws: WebSocket, buffer: ArrayBuffer) {
    const { event, data } = JSON.parse(decodeText(buffer))
    this.emit(event, data)
  }

  [KEYS[MessageType.StreamPull]](ws: WebSocket, buffer: ArrayBuffer) {
    const id = decodeNumber(
      buffer.slice(0, Uint32Array.BYTES_PER_ELEMENT),
      Uint32Array
    )
    const size = decodeNumber(
      buffer.slice(Uint32Array.BYTES_PER_ELEMENT),
      Uint32Array
    )
    const stream = this.streams.get(id)
    stream.emit(KEYS[MessageType.StreamPull], size)
  }
}

class Stream extends EventEmitter {
  paused = true
  sentBytes = 0

  private id: number
  private reader: ReadableStreamDefaultReader<Uint8Array>
  private meta: StreamMeta
  private queue: ArrayBuffer

  constructor(private readonly client: Client, private readonly blob: Blob) {
    super()
    this.reader = blob.stream().getReader()
    //@ts-expect-error
    this.id = client.nextStreamId++
    //@ts-expect-error
    client.streams.set(this.id, this)
    this.meta = {
      size: blob.size,
      type: blob.type,
      name: blob instanceof File ? blob.name : undefined,
    }

    this.on(KEYS[MessageType.StreamPull], (size: number) => {
      if (!this.sentBytes) {
        this.resume()
        this.emit('start')
      }
      this.push(size)
    })
  }

  private next() {
    if (this.sentBytes && this.paused) return once(this, 'resume')
  }

  private async read(size: number) {
    if (this.queue?.byteLength > 0) {
      const end = Math.min(size, this.queue.byteLength)
      const chunk = this.queue.slice(0, end)
      this.queue = this.queue.byteLength > size ? this.queue.slice(end) : null
      return { chunk }
    } else {
      const { done, value } = await this.reader.read()
      if (done) {
        return { done }
      } else {
        this.queue = value
        return this.read(size)
      }
    }
  }

  private async push(size: number) {
    await this.next()
    try {
      const { done, chunk } = await this.read(size)
      if (done) {
        //@ts-expect-error
        this.client.sendWithWs(
          MessageType.StreamEnd,
          encodeNumber(this.id, Uint32Array)
        )
        this.reader.cancel()
        // @ts-ignore
        this.client.streams.delete(this.id)
        this.emit('end')
      } else {
        this.sentBytes += chunk.byteLength
        //@ts-expect-error
        this.client.sendWithWs(
          MessageType.StreamPush,
          concat(encodeNumber(this.id, Uint32Array), chunk)
        )
        this.emit('progress', this.meta.size, this.sentBytes)
      }
    } catch (e) {
      //@ts-expect-error
      this.client.sendWithWs(
        MessageType.StreamTerminate,
        encodeNumber(this.id, Uint32Array)
      )
      this.destroy(e)
    }
  }

  destroy(error?: Error) {
    //@ts-expect-error
    this.client.streams.delete(this.id)
    this.reader.cancel(error)
    if (error) this.emit('error', error)
    this.emit('close')
  }

  pause() {
    this.paused = true
    this.emit('pause')
  }

  resume() {
    this.paused = false
    this.emit('resume')
  }

  private get [STREAM_ID_KEY]() {
    return this.id
  }
}
