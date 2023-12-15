import EventEmitter from 'events'
import { concat, decodeText, encodeText } from './binary'

export enum StreamDataType {
  Binary = 'Binary',
  Json = 'Json',
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

interface StreamInferface {
  on(event: 'start', listener: () => void): this
  on(event: 'end', listener: () => void): this
  on(event: 'progress', listener: (sent: number, total: number) => void): this
  on(event: 'error', listener: (error?: any) => void): this

  once(event: 'start', listener: () => void): this
  once(event: 'end', listener: () => void): this
  once(event: 'progress', listener: (sent: number, total: number) => void): this
  once(event: 'error', listener: (error?: any) => void): this
}

export class Stream extends EventEmitter implements StreamInferface {
  constructor(readonly id: string) {
    super()
  }
}
