import { MessageType } from '@neemata/common'
import { EventEmitter } from 'events'
import type { Neemata } from './client'
import { randomUUID } from './utils'

export class Stream extends EventEmitter {
  private _id: string
  private _streaming = false
  private _initialized = false

  constructor(
    private readonly _neemata: Neemata,
    private readonly _data: Blob | File
  ) {
    super()

    this._id = randomUUID()

    this.once('init', () => (this._initialized = true))
    this.once('pull', () => this._start())
  }

  get size() {
    return this._data.size
  }

  get type() {
    return this._data.type
  }

  get name() {
    // @ts-ignore
    return this._data.name
  }

  get streaming() {
    return this._streaming
  }

  get initialized() {
    return this._initialized
  }

  get id() {
    return this._id
  }

  _init() {
    if (this._initialized) throw new Error('Stream already initialized')
    const { size, type, name } = this
    this._neemata._ws?.send(
      JSON.stringify({
        type: MessageType.Event,
        payload: {
          event: 'neemata/stream/init',
          data: { id: this._id, size, type, name },
        },
      })
    )
    return new Promise((r) => this.once('init', r))
  }

  async _start() {
    if (this._streaming) throw new Error('Stream already started')
    this._streaming = true
    await fetch(this._neemata._getUrl('neemata/stream', { id: this._id }), {
      method: 'POST',
      body: this._data,
      headers: {
        'Content-Type': 'application/octet-stream',
      },
    })
    this._streaming = false
    this._initialized = false
    this.emit('finish')
  }

  _serialize() {
    return { __type: 'neemata/stream', __id: this._id }
  }
}
