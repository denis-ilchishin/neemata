import { EventEmitter, EventsType } from './event-emitter'
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

export type ResolveApiProcedureType<
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
  timer: ReturnType<typeof setTimeout> | null
}

export type BaseClientEvents = {
  '_neemata:open': never
  '_neemata:close': never
  '_neemata:connect': never
  '_neemata:healthy': never
}
export abstract class BaseClient<
  Procedures extends any = never,
  Events extends EventsType = never,
  RPCOptions = never
> extends EventEmitter<Events & BaseClientEvents> {
  protected streams = {
    up: new Map<number, UpStream>(),
    down: new Map<number, DownStream>(),
    streamId: 0,
  }

  abstract rpc<P extends keyof Procedures>(
    procedure: P,
    ...args: Procedures extends never
      ? [any?, RPCOptions?]
      : null | undefined extends ResolveApiProcedureType<Procedures, P, 'input'>
      ? [ResolveApiProcedureType<Procedures, P, 'input'>?, RPCOptions?]
      : [ResolveApiProcedureType<Procedures, P, 'input'>, RPCOptions?]
  ): Promise<
    Procedures extends never
      ? any
      : ResolveApiProcedureType<Procedures, P, 'output'>
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
