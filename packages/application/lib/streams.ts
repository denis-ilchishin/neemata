import { PassThrough, Transform, TransformCallback } from 'node:stream'

export class JsonStreamResponse<Type = any> extends Transform {
  _!: {
    type: Type
  }

  constructor() {
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
}

export class BinaryStreamResponse extends PassThrough {}
