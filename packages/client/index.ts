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

const STREAM_ID_KEY = Symbol()

type Options = {
  host: string
  https?: boolean
  basePath?: string
  timeout?: number
  autoreconnect?: boolean
}

type Send = (type: MessageType, payload: ArrayBuffer) => any

let nextStreamId = 1
let nextCallId = 1
let nextReconnect = 0

const calls = new Map()
const streams = new Map<number, any>()

const internalEvents = {
  [MessageType.RPC]: Symbol(),
  [MessageType.STREAM_PULL]: Symbol(),
  [MessageType.STREAM_END]: Symbol(),
  [MessageType.STREAM_PUSH]: Symbol(),
  [MessageType.STREAM_TERMINATE]: Symbol(),
}

export const createClient = (options: Options) => {
  let ws: WebSocket
  let isHealthy = false
  let isConnected = false
  let autoreconnect = options.autoreconnect ?? true

  const emitter = new EventEmitter()

  const httpUrl = new URL(
    `${options.https ? 'https' : 'http'}://${options.host}`,
    options.basePath
  )

  const wsUrl = new URL(
    options.basePath ?? '/',
    `${options.https ? 'wss' : 'ws'}://${options.host}`
  )

  const healthCheck = async () => {
    while (!isHealthy) {
      try {
        const { ok } = await fetch(httpUrl + 'health')
        isHealthy = ok
      } catch (e) {}
      nextReconnect = Math.min(nextReconnect + 1, 10)
      await new Promise((r) => setTimeout(r, nextReconnect * 1000))
    }
    emitter.emit('healthy')
  }

  const connect = async () => {
    autoreconnect = options.autoreconnect ?? true

    await healthCheck()

    ws = new WebSocket(wsUrl + 'api')

    ws.binaryType = 'arraybuffer'

    ws.onmessage = (event) => {
      const buffer: ArrayBuffer = event.data
      const type = decodeNumber(buffer, Uint8Array)
      emitter.emit(
        internalEvents[type],
        ws,
        buffer.slice(Uint8Array.BYTES_PER_ELEMENT)
      )
    }

    ws.onopen = (event) => {
      isConnected = true
      emitter.emit('connect')
      nextReconnect = 0
    }

    ws.onclose = (event) => {
      isConnected = false
      isHealthy = false
      emitter.emit('disconnect')
      clear()
      if (autoreconnect) connect()
    }

    ws.onerror = (event) => {
      isHealthy = false
    }

    await forEvent(emitter, 'connect')

    return client
  }

  const disconnect = () => {
    autoreconnect = false
    ws.close(1000)
    return forEvent(emitter, 'disconnect')
  }

  const clear = (error?: Error) => {
    for (const call of calls.values()) {
      const [, reject, timer] = call
      clearTimeout(timer)
      reject(error)
    }
    calls.clear()

    for (const stream of streams.values()) stream.destroy(error)
    streams.clear()
  }

  const send: Send = async (type, payload) => {
    if (!isConnected) await forEvent(emitter, 'connect')
    ws.send(concat(encodeNumber(type, Uint8Array), payload))
  }

  const rpc = (
    procedure: string,
    payload: any,
    timeout: number = options.timeout
  ) => {
    const callId = nextCallId++
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
    const streamsPayload = encodeText(JSON.stringify(streams))
    const streamDataLength = encodeNumber(
      streamsPayload.byteLength,
      Uint32Array
    )
    send(MessageType.RPC, concat(streamDataLength, streamsPayload, callPayload))

    const timer = setTimeout(() => {
      const call = calls.get(callId)
      if (call) {
        const [, reject] = call
        reject(new ApiError(ErrorCode.RequestTimeout, 'Request timeout'))
        calls.delete(callId)
      }
    }, timeout || 15000)

    return new Promise((res, rej) => calls.set(callId, [res, rej, timer]))
  }

  emitter.on(internalEvents[MessageType.STREAM_PULL], (ws, buffer) => {
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
    const stream = streams.get(id)
    stream.push(received)
  })

  emitter.on(internalEvents[MessageType.RPC], (ws, buffer) => {
    const { callId, response, error } = JSON.parse(decodeText(buffer))
    const call = calls.get(callId)
    if (call) {
      const [resolve, reject, timer] = call
      clearTimeout(timer)
      calls.delete(callId)
      if (error) reject(new ApiError(error.code, error.message, error.data))
      else resolve(response)
    }
  })

  const client = Object.assign(emitter, {
    connect,
    disconnect,
    rpc,
    createStream: createStream.bind(undefined, send),
  })

  return client
}

const createStream = (send: Send, file: File) => {
  const emitter = new EventEmitter()
  const reader = file.stream().getReader()
  const id = nextStreamId++
  const meta: StreamMeta = {
    name: file.name,
    size: file.size,
    type: file.type,
  }
  let paused = true
  let processed = 0

  const flow = async () => {
    if (paused) await forEvent(emitter, 'resume')
  }

  const push = async (received: number) => {
    if (!processed && paused && !received) {
      resume()
      emitter.emit('start')
    }
    processed += received
    try {
      await flow()
      const { done, value } = await reader.read()
      if (done) {
        send(MessageType.STREAM_END, encodeNumber(id, Uint32Array))
        reader.cancel()
        emitter.emit('end')
      } else {
        send(
          MessageType.STREAM_PUSH,
          concat(encodeNumber(id, Uint32Array), value)
        )
        emitter.emit('progress', meta.size, received)
      }
    } catch (e) {
      send(MessageType.STREAM_TERMINATE, encodeNumber(id, Uint32Array))
      destroy(e)
    }
  }

  const destroy = (error?: Error) => {
    streams.delete(id)
    reader.cancel(error)
    if (error) emitter.emit('error', error)
    emitter.emit('close')
  }

  const pause = () => {
    paused = true
    emitter.emit('pause')
  }

  const resume = () => {
    paused = false
    emitter.emit('resume')
  }

  const stream = {
    id,
    meta,
    push,
    destroy,
  }

  streams.set(id, stream)

  return Object.assign(emitter, { [STREAM_ID_KEY]: id, meta, pause, resume })
}

const forEvent = (emitter: EventEmitter, event: string) =>
  new Promise((r) => emitter.once(event, r))
