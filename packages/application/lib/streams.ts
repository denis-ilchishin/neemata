import { StreamMetadata } from '@neemata/common'
import { Duplex, PassThrough, Transform, TransformCallback } from 'node:stream'

export class JsonStreamResponse<Payload = any, Chunk = any> extends Transform {
  _!: {
    chunk: Chunk
    payload: Payload
  }

  constructor(readonly payload: Payload) {
    super({ writableObjectMode: true })
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

export class BinaryStreamResponse<Payload = any> extends Duplex {
  _!: {
    chunk: ArrayBuffer
    payload: Payload
  }

  constructor(readonly payload: Payload) {
    super()
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
  return Object.assign(createStream(), { with: createStream })
}

export const createBinaryResponse = <Payload>(payload?: Payload) => {
  return new BinaryStreamResponse<Payload>(payload)
}
