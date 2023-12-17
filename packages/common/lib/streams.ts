import EventEmitter, { once } from 'events'
import { concat, decodeText, encodeText } from './binary'

export enum StreamDataType {
  Binary = 'Binary',
  Json = 'Json',
}

export type StreamMetadata = {
  type: string
  size: number
  filename?: string
}

export const STREAM_SERIALIZE_KEY = '__neemata:stream:'

export class AbortStreamError extends Error {}

export class DownStream<Chunk = any> extends TransformStream<any, Chunk> {
  reader: ReadableStreamDefaultReader<Chunk>
  writer: WritableStreamDefaultWriter<Chunk>

  interface: ReadableStream<Chunk> & {
    [Symbol.asyncIterator]: () => AsyncIterator<Chunk>
    abort: (reason?: any) => void
  }

  constructor(
    transform: Transformer['transform'],
    readonly ac: AbortController
  ) {
    super({ transform })
    this.ac.signal.addEventListener('abort', () => this.writable.close(), {
      once: true,
    })

    this.reader = this.readable.getReader()
    this.writer = this.writable.getWriter()

    const mixin: any = {
      abort: (reason?: any) => {
        this.ac.abort()
        this.reader.cancel(reason)
      },
    }

    if (Symbol.asyncIterator in this.readable === false) {
      mixin[Symbol.asyncIterator] = () => ({
        next: () => this.reader.read(),
      })
    }

    this.interface = Object.assign(this.readable, mixin)
  }
}

async function readNext(
  ac: AbortController,
  controller: ReadableStreamDefaultController,
  reader: ReadableStreamDefaultReader<Uint8Array>,
  cb: (chunk: Uint8Array) => void
) {
  if (ac.signal.aborted) return void controller.error(new Error('Aborted'))
  const { done, value } = await reader.read()
  if (done) return void controller.close()
  return cb(value)
}

export class BaseClientStream<Data = any> extends ReadableStream<Data> {
  constructor(
    readonly ac: AbortController,
    underlyingSource: UnderlyingDefaultSource<Data>
  ) {
    super(underlyingSource)
  }

  abort() {
    this.ac.abort()
  }

  toAsyncIterable() {
    return {
      [Symbol.asyncIterator]: () => {
        const reader = this.getReader()
        return {
          next: () => reader.read(),
        }
      },
    }
  }
}

export function createJsonStream<Data = any>(
  input: globalThis.ReadableStream<Uint8Array>,
  ac = new AbortController()
): BaseClientStream<Data> {
  let buffer: ArrayBuffer

  const decode = () => {
    let text = decodeText(buffer)
    text = text.startsWith('[\n') ? text.slice(2) : text
    const lines = text.split('\n')
    const lastLine = lines.at(-1)
    const isEnd = lastLine == ']'
    if (!isEnd) buffer = encodeText(lines.at(-1))
    const parsed = lines
      .slice(0, -1)
      .map((line) => JSON.parse(line.slice(0, isEnd ? undefined : -1)))
    return parsed
  }

  const reader = input.getReader()
  const stream = new BaseClientStream(ac, {
    start(controller) {
      const push = () => readNext(ac, controller, reader, handleChunk)
      const handleChunk = (chunk: Uint8Array) => {
        buffer = buffer ? concat(buffer, chunk.buffer) : chunk.buffer
        for (const entry of decode()) controller.enqueue(entry)
        push()
      }
      push()
    },
  })

  return stream
}

export function createBinaryStream(
  input: globalThis.ReadableStream<Uint8Array>,
  ac = new AbortController()
): BaseClientStream<Uint8Array> {
  const reader = input.getReader()
  const stream = new BaseClientStream(ac, {
    start(controller) {
      const push = () => readNext(ac, controller, reader, handleChunk)
      const handleChunk = (chunk: Uint8Array) => {
        controller.enqueue(chunk)
        push()
      }
      push()
    },
  })

  return stream
}

type StreamInferfaceEvent = {
  start: () => void
  end: () => void
  progress: (bytesLength: number) => void
  error: (error?: any) => void
  close: () => void
}

interface StreamInferface {
  on<Event extends keyof StreamInferfaceEvent>(
    event: Event,
    listener: StreamInferfaceEvent[Event]
  ): this
  once<Event extends keyof StreamInferfaceEvent>(
    event: Event,
    listener: StreamInferfaceEvent[Event]
  ): this
}

export class UpStream extends EventEmitter implements StreamInferface {
  private source: ReadableStream
  private reader: ReadableStreamDefaultReader<Uint8Array>
  private readBuffer: ArrayBuffer

  bytesSent = 0
  paused = false

  constructor(
    readonly id: number,
    readonly metadata: StreamMetadata,
    source: ArrayBuffer | ReadableStream | Blob
  ) {
    super()

    this.source =
      source instanceof ReadableStream
        ? source
        : source instanceof Blob
        ? source.stream()
        : source instanceof ArrayBuffer
        ? new Blob([source]).stream()
        : undefined

    if (typeof this.source === 'undefined')
      throw new Error('Stream source is not supported')

    this.reader = this.source.getReader()
  }

  destroy(error?: Error) {
    this.reader.cancel(error)
    if (error) this.emit('error', error)
    this.emit('close')
    this.readBuffer = undefined
  }

  pause() {
    this.paused = true
    this.emit('pause')
  }

  resume() {
    this.paused = false
    this.emit('resume')
  }

  async _read(size: number): Promise<{ done?: boolean; chunk?: ArrayBuffer }> {
    if (!this.bytesSent) this.emit('start')
    if (this.bytesSent && this.paused) await once(this, 'resume')
    if (this.readBuffer?.byteLength > 0) {
      const end = Math.min(size, this.readBuffer.byteLength)
      const chunk = this.readBuffer.slice(0, end)
      this.readBuffer =
        this.readBuffer.byteLength > size ? this.readBuffer.slice(end) : null
      this.bytesSent = this.bytesSent + chunk.byteLength
      this.emit('progress', this.bytesSent)
      return { chunk }
    } else {
      const { done, value } = await this.reader.read()
      if (done) {
        return { done }
      } else {
        this.readBuffer = value
        return this._read(size)
      }
    }
  }

  _finish() {
    this.emit('end')
    this.destroy()
  }

  _serialize() {
    return STREAM_SERIALIZE_KEY + this.id
  }
}
