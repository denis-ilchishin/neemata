import EventEmitter from 'events'
import { DownStream, StreamMetadata, UpStream } from './streams'

export class ApiError extends Error {
  code: string
  data?: any

  constructor(code: string, message?: string, data?: any) {
    super(message)
    this.code = code
    this.data = data
  }

  get message() {
    return this.code + super.message
  }

  toString() {
    return `${this.code} ${this.message}`
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      data: this.data,
    }
  }
}

export type ApiProcedureType = {
  input?: any
  output?: any
}

export type ResolveProcedureApiType<
  Api,
  Key,
  Type extends keyof ApiProcedureType
> = Key extends keyof Api
  ? Api[Key] extends ApiProcedureType
    ? Api[Key][Type]
    : any
  : any

export type Call = {
  resolve: (value?: any) => void
  reject: (reason?: any) => void
  timer: ReturnType<typeof setTimeout>
}

export abstract class BaseClient<
  Api extends any = never,
  RPCOptions = never
> extends EventEmitter {
  protected streams = {
    up: new Map<number, UpStream>(),
    down: new Map<number, DownStream>(),
    streamId: 0,
  }

  abstract rpc<P extends keyof Api>(
    procedure: P,
    ...args: Api extends never
      ? [any?, RPCOptions?]
      : null | undefined extends ResolveProcedureApiType<Api, P, 'input'>
      ? [ResolveProcedureApiType<Api, P, 'input'>?, RPCOptions?]
      : [ResolveProcedureApiType<Api, P, 'input'>, RPCOptions?]
  ): Promise<
    Api extends never ? any : ResolveProcedureApiType<Api, P, 'output'>
  >
  abstract connect(): Promise<void>
  abstract disconnect(): Promise<void>
  abstract reconnect(): Promise<void>
  async createStream<I extends Blob | ArrayBuffer | ReadableStream>(
    source: I,
    metadata: Partial<StreamMetadata> = {}
  ) {
    if (source instanceof File && !metadata.filename) {
      metadata.type = source.type
    }

    if (!metadata.size) {
      if (source instanceof Blob) {
        metadata.size = source.size
      } else if (source instanceof ArrayBuffer) {
        metadata.size = source.byteLength
      } else if (source instanceof ReadableStream) {
        throw new Error('Size is required for ReadableStream')
      }
    }

    const id = ++this.streams.streamId
    const stream = new UpStream(id, metadata as StreamMetadata, source)
    this.streams.up.set(id, stream)
    return stream
  }
}
