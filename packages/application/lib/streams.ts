import { StreamMetadata } from '@neemata/common'
import { PassThrough, TransformCallback, TransformOptions } from 'node:stream'

export abstract class StreamResponse<
  Payload = any,
  Chunk = any
> extends PassThrough {
  _!: {
    chunk: Chunk
    payload: Payload
  }

  constructor(public payload: Payload, options?: TransformOptions) {
    super(options)
  }
}

export class JsonStreamResponse<
  Payload = any,
  Chunk = any
> extends StreamResponse<Payload, Chunk> {
  constructor(readonly payload: Payload) {
    super(payload, { writableObjectMode: true })
  }

  _transform(
    chunk: any,
    encoding: BufferEncoding,
    callback: TransformCallback
  ): void {
    try {
      callback(null, JSON.stringify(chunk))
    } catch (error: any) {
      callback(error)
    }
  }

  write(
    chunk: Chunk,
    encodingOrCb?: BufferEncoding | ((error: Error | null | undefined) => void),
    cb?: (error: Error | null | undefined) => void
  ): boolean {
    if (typeof encodingOrCb === 'function') cb = encodingOrCb
    return super.write(chunk, undefined, cb)
  }
}

export class BinaryStreamResponse<Payload = any> extends StreamResponse<
  Payload,
  ArrayBuffer
> {
  constructor(payload: Payload, readonly type: string) {
    super(payload)
  }
}

export class Stream extends PassThrough {
  bytesReceived = 0

  constructor(
    readonly id: string,
    readonly metadata: StreamMetadata,
    read?: (size: number) => void,
    highWaterMark?: number
  ) {
    super({ highWaterMark, read })
  }

  push(chunk?: Buffer) {
    if (chunk !== null) this.bytesReceived += chunk.byteLength
    return super.push(chunk)
  }
}

export const createJsonResponse = <Payload>(payload?: Payload) => {
  const createStream = <Chunk = any>() =>
    new JsonStreamResponse<Payload, Chunk>(payload)
  const stream = createStream()
  const helper: typeof createStream = () => stream
  return Object.assign(stream, { with: helper })
}

export const createBinaryResponse = <Payload>(
  type: string,
  payload?: Payload
) => {
  return new BinaryStreamResponse<Payload>(payload, type)
}
