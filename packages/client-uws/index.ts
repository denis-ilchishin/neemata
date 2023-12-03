import {
  ApiError,
  BaseClient,
  ErrorCode,
  ResolveProcedureApiType,
} from '@neemata/common'

import { EventEmitter, once } from 'events'

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
  secure?: boolean
  timeout?: number
  autoreconnect?: boolean
  debug?: boolean
  standalone?: boolean
}

type RPCOptions = {
  timeout?: number
  useHttp?: boolean
}

const STREAM_ID_KEY = Symbol()

const KEYS = {
  [MessageType.Rpc]: Symbol(),
  [MessageType.StreamPull]: Symbol(),
  [MessageType.StreamEnd]: Symbol(),
  [MessageType.StreamTerminate]: Symbol(),
  [MessageType.Event]: Symbol(),
} as const

class Client<Api extends any = never> extends BaseClient<Api, RPCOptions> {
  private readonly httpUrl: URL
  private readonly wsUrl: URL
  private _ws: WebSocket
  private _autoreconnect: boolean
  private _URLParams: URLSearchParams = new URLSearchParams()
  private _isHealthy = false
  private _isConnected = false

  readonly streams = new Map<number, Stream>()
  _nextReconnect = -1
  _nextStreamId = 1

  constructor(private readonly options: Options) {
    super()

    const schema = (schema: string) => schema + (options.secure ? 's' : '')

    this.httpUrl = new URL(`${schema('http')}://${options.host}`)
    this.wsUrl = new URL(`${schema('ws')}://${options.host}`)
  }

  async healthCheck() {
    while (!this._isHealthy) {
      try {
        const { ok } = await fetch(`${this.httpUrl}health`)
        this._isHealthy = ok
      } catch (e) {}
      this._nextReconnect = Math.min(this._nextReconnect + 1, 15)
      await new Promise((r) => setTimeout(r, this._nextReconnect * 1000))
    }
    this.emit('healthy')
  }

  async connect() {
    this._autoreconnect = this.options.autoreconnect ?? true // reset default autoreconnect value
    await this.healthCheck()

    this._ws = new WebSocket(this._applyURLParams(new URL('api', this.wsUrl)))
    this._ws.binaryType = 'arraybuffer'

    this._ws.onmessage = (event) => {
      const buffer: ArrayBuffer = event.data
      const type = decodeNumber(buffer, 'Uint8')
      const isValidKey = type in KEYS
      if (isValidKey) {
        // @ts-ignore
        const handler = this[KEYS[type]].bind(this)
        handler(this._ws, buffer.slice(Uint8Array.BYTES_PER_ELEMENT))
      }
    }
    this._ws.onopen = (event) => {
      this._isConnected = true
      this.emit('open')
      this._nextReconnect = -1
    }
    this._ws.onclose = (event) => {
      this._isConnected = false
      this._isHealthy = false
      this.emit('close')
      this._clear()
      if (this._autoreconnect) this.connect()
    }
    this._ws.onerror = (event) => {
      this._isHealthy = false
    }

    await once(this, 'open')

    this.emit('connect')
  }

  async disconnect() {
    this._autoreconnect = false // disable autoreconnect if manually disconnected
    this._ws.close(1000)
    return await once(this, 'close')
  }

  async reconnect(urlParams?: URLSearchParams) {
    await this.disconnect()
    if (urlParams) this.setGetParams(urlParams)
    await this.connect()
  }

  rpc<P extends keyof Api>(
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
    const { timeout = options.timeout, useHttp = false } = options
    const callId = this._nextCallId++
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
      return this._sendViaHttp(procedure as string, payload)
    } else {
      const streamsData = encodeText(JSON.stringify(streams))
      const streamDataLength = encodeNumber(streamsData.byteLength, 'Uint32')
      const data = concat(streamDataLength, streamsData, callPayload)
      const timer = setTimeout(() => {
        const call = this._calls.get(callId)
        if (call) {
          const reject = call[1]
          reject(new ApiError(ErrorCode.RequestTimeout, 'Request timeout'))
          this._calls.delete(callId)
        }
      }, timeout || 30000)

      return new Promise((resolse, reject) => {
        this._calls.set(callId, [resolse, reject, timer])
        this._sendViaWs(MessageType.Rpc, data)
      })
    }
  }

  createStream(blob: Blob) {
    return new Stream(this, blob)
  }

  setGetParams(params: URLSearchParams) {
    this._URLParams = params
  }

  _applyURLParams(url: URL) {
    for (const [key, value] of this._URLParams.entries())
      url.searchParams.set(key, value)
    return url
  }

  async _clear(error?: Error) {
    for (const call of this._calls.values()) {
      const [, reject, timer] = call
      clearTimeout(timer)
      reject(error)
    }
    this._calls.clear()

    for (const stream of this.streams.values()) stream.destroy(error)
    this.streams.clear()
  }

  async _sendViaWs(type: MessageType, payload: ArrayBuffer) {
    if (!this._isConnected) await once(this, 'connect')
    this._ws.send(concat(encodeNumber(type, 'Uint8'), payload))
  }

  async _sendViaHttp(procedure: string, payload: any) {
    return fetch(
      this._applyURLParams(new URL(`api/${procedure}`, this.httpUrl)),
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
    const call = this._calls.get(callId)
    if (call) {
      const [resolve, reject, timer] = call
      clearTimeout(timer)
      this._calls.delete(callId)
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
  readonly meta: StreamMeta
  paused = true
  sentBytes = 0

  private readonly id: number
  private readonly reader: ReadableStreamDefaultReader<Uint8Array>
  private queue: ArrayBuffer

  constructor(
    private readonly _client: Client<any>,
    private readonly _blob: Blob
  ) {
    super()
    this.reader = _blob.stream().getReader()
    this.id = _client._nextStreamId++
    this.meta = {
      size: _blob.size,
      type: _blob.type,
      name: _blob instanceof File ? _blob.name : undefined,
    }

    this.on(KEYS[MessageType.StreamPull], (size: number) => {
      if (!this.sentBytes) {
        this.resume()
        this.emit('start')
      }
      this.push(size)
    })

    _client.streams.set(this.id, this)
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
        this._client._sendViaWs(
          MessageType.StreamEnd,
          encodeNumber(this.id, 'Uint16')
        )
        this.reader.cancel()
        this._client.streams.delete(this.id)
        this.emit('end')
      } else {
        this.sentBytes += chunk.byteLength
        this._client._sendViaWs(
          MessageType.StreamPush,
          concat(encodeNumber(this.id, 'Uint16'), chunk)
        )
        this.emit('progress', this.meta.size, this.sentBytes)
      }
    } catch (e: any) {
      this._client._sendViaWs(
        MessageType.StreamTerminate,
        encodeNumber(this.id, 'Uint16')
      )
      this.destroy(e)
    }
  }

  destroy(error?: Error) {
    this._client.streams.delete(this.id)
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
