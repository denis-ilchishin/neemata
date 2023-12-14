import { concat, decodeText, encodeText } from './binary'

export class BaseClientStream<Data = any> extends ReadableStream<Data> {
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
  input: InstanceType<typeof ReadableStream<Uint8Array>>
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
      .map((line) => line.slice(0, isEnd ? undefined : -1))
    return parsed
  }

  const reader = input.getReader()
  const stream = new BaseClientStream({
    start(controller) {
      async function push(): Promise<void> {
        const { done, value } = await reader.read()
        if (done) return void controller.close()
        buffer = buffer ? concat(buffer, value.buffer) : value.buffer
        controller.enqueue(decode())
        push()
      }
      push()
    },
  })

  return stream
}

export function createBinaryStream(
  input: globalThis.ReadableStream<Uint8Array>
): BaseClientStream<Uint8Array> {
  Object.assign(input, 'toAsyncIterable', () => {
    return {
      [Symbol.asyncIterator]: () => {
        const reader = input.getReader()
        return {
          next: () => reader.read(),
        }
      },
    }
  })
  // @ts-ignore
  return input
}
