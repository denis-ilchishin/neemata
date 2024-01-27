import { EventEmitter, once } from './event-emitter'

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
  writer: WritableStreamDefaultWriter

  interface: ReadableStream<Chunk> & {
    [Symbol.asyncIterator]: () => AsyncIterator<Chunk>
    abort: (reason?: any) => void
  }

  constructor(
    transform: Transformer['transform'],
    readonly ac: AbortController,
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

type StreamInferfaceEvents = {
  start: never
  end: never
  progress: number
  error: any
  close: never
}

export class UpStream extends EventEmitter<StreamInferfaceEvents> {
  private source: ReadableStream
  private reader?: ReadableStreamDefaultReader<Uint8Array>
  private readBuffer?: ArrayBuffer

  bytesSent = 0
  paused = false

  constructor(
    readonly id: number,
    readonly metadata: StreamMetadata,
    source: ArrayBuffer | ReadableStream | Blob,
  ) {
    super()

    // @ts-expect-error
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
    this.reader?.cancel(error)
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
    if (this.readBuffer && this.readBuffer.byteLength > 0) {
      const end = Math.min(size, this.readBuffer.byteLength)
      const chunk = this.readBuffer.slice(0, end)
      this.readBuffer =
        this.readBuffer.byteLength > size
          ? this.readBuffer.slice(end)
          : undefined
      this.bytesSent = this.bytesSent + chunk.byteLength
      this.emit('progress', this.bytesSent)
      return { chunk }
    } else {
      const { done, value } = await this.reader!.read()
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
