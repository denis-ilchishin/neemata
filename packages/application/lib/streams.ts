import { PassThrough, Transform, TransformCallback } from 'node:stream'

export class JsonStream<Type = any> extends Transform {
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
      chunk = chunk instanceof Buffer ? chunk.toString('base64') : chunk
      callback(null, JSON.stringify(chunk))
    } catch (error: any) {
      callback(error)
    }
  }
}

export class BinaryStream extends PassThrough {}
