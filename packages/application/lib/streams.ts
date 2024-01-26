import { StreamMetadata } from '@neemata/common'
import { PassThrough, TransformCallback } from 'node:stream'

export abstract class StreamResponse<
  Payload = any,
  Chunk = any,
> extends PassThrough {
  readonly chunk!: Chunk
  readonly payload!: Payload
}

export class JsonStreamResponse<
  Payload = any,
  Chunk = any,
> extends StreamResponse<Payload, Chunk> {
  constructor() {
    super({ writableObjectMode: true })
  }

  _transform(
    chunk: any,
    encoding: BufferEncoding,
    callback: TransformCallback,
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
    cb?: (error: Error | null | undefined) => void,
  ): boolean {
    if (typeof encodingOrCb === 'function') cb = encodingOrCb
    return super.write(chunk, undefined, cb)
  }

  withChunk<Chunk>() {
    return this as unknown as JsonStreamResponse<Payload, Chunk>
  }

  withPayload<Payload>(payload: Payload) {
    // @ts-expect-error
    this.payload = payload
    return this as unknown as JsonStreamResponse<Payload, Chunk>
  }
}

export class BinaryStreamResponse<Payload = any> extends StreamResponse<
  Payload,
  ArrayBuffer
> {
  constructor(readonly type: string) {
    super()
  }

  withPayload<Payload>(payload: Payload) {
    // @ts-expect-error
    this.payload = payload
    return this as unknown as BinaryStreamResponse<Payload>
  }
}

export class Stream extends PassThrough {
  bytesReceived = 0

  constructor(
    readonly id: string,
    readonly metadata: StreamMetadata,
    read?: (size: number) => void,
    highWaterMark?: number,
  ) {
    super({ highWaterMark, read })
  }

  push(chunk: Buffer | null) {
    if (chunk !== null) this.bytesReceived += chunk.byteLength
    return super.push(chunk)
  }
}
