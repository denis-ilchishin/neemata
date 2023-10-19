import {
  ApiError,
  ErrorCode,
  MessageType,
  STREAM_ID_PREFIX,
  StreamMeta,
  concat,
  decodeBigNumber,
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
}

const once = (emitter: EventEmitter, event: string) =>
  new Promise((r) => emitter.once(event, r))

const STREAM_ID_KEY = Symbol()

const internalEvents = {
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
  private calls = new Map()
  private streams = new Map<number, any>()

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

    this.on(internalEvents[MessageType.StreamPull], (ws, buffer) => {
      const id = decodeNumber(
        buffer.slice(0, Uint32Array.BYTES_PER_ELEMENT),
        Uint32Array
      )
      const received = decodeBigNumber(
        buffer.slice(
          Uint32Array.BYTES_PER_ELEMENT,
          BigUint64Array.BYTES_PER_ELEMENT + Uint32Array.BYTES_PER_ELEMENT
        ),
        BigUint64Array
      )
      const stream = this.streams.get(id)
      stream.push(received)
    })

    this.on(internalEvents[MessageType.Rpc], (ws, buffer) => {
      const {
        callId,
        payload: { error, response },
      } = JSON.parse(decodeText(buffer))
      const call = this.calls.get(callId)
      if (call) {
        const [resolve, reject, timer] = call
        clearTimeout(timer)
        this.calls.delete(callId)
        if (error) reject(new ApiError(error.code, error.message, error.data))
        else resolve(response)
      }
    })

    this.on(internalEvents[MessageType.Event], (ws, buffer) => {
      const { event, data } = JSON.parse(decodeText(buffer))
      this.emit(event, data)
    })
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
    this.autoreconnect = this.options.autoreconnect ?? true
    await this.healthCheck()
    this.ws = new WebSocket(`${this.wsUrl}api`)
    this.ws.binaryType = 'arraybuffer'

    this.ws.onmessage = (event) => {
      const buffer: ArrayBuffer = event.data
      const type = decodeNumber(buffer, Uint8Array)
      this.emit(
        internalEvents[type],
        this.ws,
        buffer.slice(Uint8Array.BYTES_PER_ELEMENT)
      )
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
    this.autoreconnect = false
    this.ws.close(1000)
    return await once(this, 'disconnect')
  }

  rpc(
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
          const [, reject] = call
          reject(new ApiError(ErrorCode.RequestTimeout, 'Request timeout'))
          this.calls.delete(callId)
        }
      }, timeout || 30000)

      return new Promise((...args) => {
        this.calls.set(callId, [...args, timer])
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
}

class Stream extends EventEmitter {
  private reader: ReadableStreamDefaultReader
  private id: number
  private meta: StreamMeta

  private paused = true
  private processed = 0
  private received = 0

  constructor(private readonly client: Client, private readonly blob: Blob) {
    super()
    this.reader = blob.stream().getReader()
    //@ts-expect-error
    this.id = client.nextStreamId++
    Object.defineProperty(this, STREAM_ID_KEY, this.id)
    this.meta = {
      size: blob.size,
      type: blob.type,
      name: blob instanceof File ? blob.name : undefined,
    }
  }

  async flow() {
    if (this.paused) await once(this, 'resume')
  }

  async push() {
    if (!this.processed && this.paused && !this.received) {
      this.resume()
      this.emit('start')
    }
    this.processed += this.received
    try {
      await this.flow()
      const { done, value } = await this.reader.read()
      if (done) {
        //@ts-expect-error
        this.client.sendWithWs(
          MessageType.StreamEnd,
          encodeNumber(this.id, Uint32Array)
        )
        this.reader.cancel()
        this.emit('end')
      } else {
        //@ts-expect-error
        this.client.sendWithWs(
          MessageType.StreamPush,
          concat(encodeNumber(this.id, Uint32Array), value)
        )
        this.emit('progress', this.meta.size, this.received)
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
}
