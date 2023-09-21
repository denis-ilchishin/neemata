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

type SendWithWs = (type: MessageType, payload: ArrayBuffer) => any

let nextStreamId = 1
let nextCallId = 1
let nextReconnect = 0

const calls = new Map()
const streams = new Map<number, any>()

const internalEvents = {
  [MessageType.Rpc]: Symbol(),
  [MessageType.StreamPull]: Symbol(),
  [MessageType.StreamEnd]: Symbol(),
  [MessageType.StreamPull]: Symbol(),
  [MessageType.StreamTerminate]: Symbol(),
  [MessageType.Event]: Symbol(),
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

  const sendWithWs: SendWithWs = async (type, payload) => {
    if (!isConnected) await forEvent(emitter, 'connect')
    ws.send(concat(encodeNumber(type, Uint8Array), payload))
  }

  const sendWithFetch = async (procedure, payload) => {
    return fetch(httpUrl + 'api' + '/' + procedure, {
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

  const rpc = (
    procedure: string,
    payload: any,
    options: {
      timeout?: number
      useHttp?: boolean
    } = {}
  ) => {
    const { timeout = options.timeout, useHttp = false } = options
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

    if (useHttp && streams.length)
      throw new Error('Unable to stream data over HTTP')

    if (useHttp) {
      return sendWithFetch(procedure, payload)
    } else {
      const streamsPayload = encodeText(JSON.stringify(streams))
      const streamDataLength = encodeNumber(
        streamsPayload.byteLength,
        Uint32Array
      )
      const data = concat(streamDataLength, streamsPayload, callPayload)
      sendWithWs(MessageType.Rpc, data)

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
  }

  emitter.on(internalEvents[MessageType.StreamPull], (ws, buffer) => {
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

  emitter.on(internalEvents[MessageType.Rpc], (ws, buffer) => {
    const {
      callId,
      payload: { error, response },
    } = JSON.parse(decodeText(buffer))
    const call = calls.get(callId)
    if (call) {
      const [resolve, reject, timer] = call
      clearTimeout(timer)
      calls.delete(callId)
      if (error) reject(new ApiError(error.code, error.message, error.data))
      else resolve(response)
    }
  })

  emitter.on(internalEvents[MessageType.Event], (ws, buffer) => {
    const { event, data } = JSON.parse(decodeText(buffer))
    emitter.emit(event, data)
  })

  const client = Object.assign(emitter, {
    connect,
    disconnect,
    rpc,
    createStream: createStream.bind(undefined, sendWithWs),
  })

  return client
}

const createStream = (send: SendWithWs, file: File) => {
  const emitter = new EventEmitter()
  // @ts-expect-error
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
        send(MessageType.StreamEnd, encodeNumber(id, Uint32Array))
        reader.cancel()
        emitter.emit('end')
      } else {
        send(
          MessageType.StreamPush,
          concat(encodeNumber(id, Uint32Array), value)
        )
        emitter.emit('progress', meta.size, received)
      }
    } catch (e) {
      send(MessageType.StreamTerminate, encodeNumber(id, Uint32Array))
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
