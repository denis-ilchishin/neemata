import { ApiError, ErrorCode } from '@neemata/common'
import { EventEmitter } from 'events'
import {
  MessageType,
  STREAM_ID_PREFIX,
  type StreamMeta,
} from '../adapter-uws/lib/types'
import {
  concat,
  decodeNumber,
  decodeText,
  encodeNumber,
  encodeText,
} from '../adapter-uws/lib/utils'

export { ApiError, Client, ErrorCode }
export type { Stream, StreamMeta }

type Options = {
  host: string
  https?: boolean
  basePath?: string
  timeout?: number
  autoreconnect?: boolean
  debug?: boolean
  standalone?: boolean
}

type Call = [
  (value?: any) => void,
  (reason?: any) => void,
  ReturnType<typeof setTimeout>
]

type RPCOptions = {
  timeout?: number
  useHttp?: boolean
}

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

type GeneratedApi = {
  input?: any
  output?: any
}

type GenerateApiType<
  Api,
  Key,
  Type extends keyof GeneratedApi
> = Key extends keyof Api
  ? Api[Key] extends GeneratedApi
    ? Api[Key][Type]
    : any
  : any

class Client<Api extends any = any> extends EventEmitter {
  private ws: WebSocket
  private autoreconnect: boolean
  private httpUrl: URL
  private wsUrl: URL
  private getParams: URLSearchParams = new URLSearchParams()
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

    this.ws = new WebSocket(this.applyGetParams(new URL('api', this.wsUrl)))
    this.ws.binaryType = 'arraybuffer'

    this.ws.onmessage = (event) => {
      const buffer: ArrayBuffer = event.data
      const type = decodeNumber(buffer, 'Uint8')
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

  rpc<P extends keyof Api>(
    procedure: P,
    ...args: Api extends never
      ? [any?, RPCOptions?]
      : null | undefined extends GenerateApiType<Api, P, 'input'>
      ? [GenerateApiType<Api, P, 'input'>?, RPCOptions?]
      : [GenerateApiType<Api, P, 'input'>, RPCOptions?]
  ): Promise<Api extends never ? any : GenerateApiType<Api, P, 'output'>> {
    const [payload, options = {}] = args
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
      return this.sendViaHttp(procedure as string, payload)
    } else {
      const streamsData = encodeText(JSON.stringify(streams))
      const streamDataLength = encodeNumber(streamsData.byteLength, 'Uint32')
      const data = concat(streamDataLength, streamsData, callPayload)
      const timer = setTimeout(() => {
        const call = this.calls.get(callId)
        if (call) {
          const reject = call[1]
          reject(new ApiError(ErrorCode.RequestTimeout, 'Request timeout'))
          this.calls.delete(callId)
        }
      }, timeout || 30000)

      return new Promise((resolse, reject) => {
        this.calls.set(callId, [resolse, reject, timer])
        this.sendViaWs(MessageType.Rpc, data)
      })
    }
  }

  createStream(blob: Blob) {
    return new Stream(this, blob)
  }

  setGetParams(params: URLSearchParams) {
    this.getParams = params
  }

  private applyGetParams(url: URL) {
    for (const [key, value] of this.getParams.entries())
      url.searchParams.append(key, value)
    return url
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

  private async sendViaWs(type: MessageType, payload: ArrayBuffer) {
    if (!this.isConnected) await once(this, 'connect')
    this.ws.send(concat(encodeNumber(type, 'Uint8'), payload))
  }

  private async sendViaHttp(procedure: string, payload: any) {
    return fetch(
      this.applyGetParams(new URL(`api/${procedure}`, this.httpUrl)),
      {
        method: 'POST',
        body: JSON.stringify(payload),
        credentials: 'include',
        cache: 'no-cache',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )
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
    const id = decodeNumber(buffer, 'Uint16')
    const size = decodeNumber(buffer, 'Uint32', Uint16Array.BYTES_PER_ELEMENT)
    const stream = this.streams.get(id)
    stream.emit(KEYS[MessageType.StreamPull], size)
  }

  [KEYS[MessageType.StreamTerminate]](ws: WebSocket, buffer: ArrayBuffer) {
    const id = decodeNumber(buffer, 'Uint16')
    const stream = this.streams.get(id)
    stream.destroy()
  }
}

class Stream extends EventEmitter {
  paused = true
  sentBytes = 0

  meta: StreamMeta
  private id: number
  private reader: ReadableStreamDefaultReader<Uint8Array>
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
        this.client.sendViaWs(
          MessageType.StreamEnd,
          encodeNumber(this.id, 'Uint16')
        )
        this.reader.cancel()
        // @ts-ignore
        this.client.streams.delete(this.id)
        this.emit('end')
      } else {
        this.sentBytes += chunk.byteLength
        //@ts-expect-error
        this.client.sendViaWs(
          MessageType.StreamPush,
          concat(encodeNumber(this.id, 'Uint16'), chunk)
        )
        this.emit('progress', this.meta.size, this.sentBytes)
      }
    } catch (e) {
      //@ts-expect-error
      this.client.sendViaWs(
        MessageType.StreamTerminate,
        encodeNumber(this.id, 'Uint16')
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
