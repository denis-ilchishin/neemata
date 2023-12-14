import { concat, decodeText, encodeText } from './binary'

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
      async function push(): Promise<void> {
        if (ac.signal.aborted)
          return void controller.error(new Error('Aborted'))
        const { done, value } = await reader.read()
        if (done) return void controller.close()
        buffer = buffer ? concat(buffer, value.buffer) : value.buffer
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
  const stream = new BaseClientStream(ac, {
    start(controller) {
      async function push(): Promise<void> {
        if (ac.signal.aborted)
          return void controller.error(new Error('Aborted'))
        const { done, value } = await input.getReader().read()
        if (done) return void controller.close()
        controller.enqueue(value)
        push()
      }
      push()
    },
  })

  return stream
}
