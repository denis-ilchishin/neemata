import type { ValueOf } from '@neemata/common'
import { ErrorCode, MessageType, Transport } from '@neemata/common'
import { EventEmitter } from 'events'
import { Stream } from './stream'
import type { NeemataOptions } from './utils'
import { NeemataError } from './utils'

let pingInterval

type Resolve = (value: unknown) => any
type Reject = (reason: Error) => any
type ApiLike = Record<string, { input: any; output: any }>
type CallArgs<
  Api extends ApiLike,
  Procedure extends keyof Api,
  Input = GetOrUnknown<Api[Procedure], 'input'>
> = Input extends never ? [Procedure] : [Procedure, Input]
type GetOrUnknown<T, K extends keyof T> = T[K] extends never ? never : T[K]

export class Neemata<
  Api extends ApiLike = never,
  Procedures extends keyof Api = keyof Api
> extends EventEmitter {
  private _connecting: Promise<void> | null = null
  private _url: URL
  private _prefer: ValueOf<typeof Transport>
  private _streams: Map<string, Stream>
  private _calls: Map<string, { resolve: Resolve; reject: Reject }>
  private _correlationId = 0
  private _options: Required<NeemataOptions>

  private _ws?: WebSocket

  constructor({
    host,
    preferHttp = false,
    pingInterval = 15000,
    pingTimeout = 10000,
    autoReconnect = true,
  }: NeemataOptions) {
    super()

    this._options = {
      host,
      preferHttp,
      pingInterval,
      pingTimeout,
      autoReconnect,
    }
    this._url = new URL(host)
    this._prefer = preferHttp ? Transport.Http : Transport.Ws
    this._streams = new Map()
    this._calls = new Map()

    // Neemata internal events
    this.on('neemata/stream/init', ({ id }) =>
      this._streams.get(id)?.emit('init')
    )
    this.on('neemata/stream/pull', ({ id }) =>
      this._streams.get(id)?.emit('pull')
    )
    this.on('neemata/session/clear', async () => {
      await fetch(this._getUrl('neemata/session/clear'), {
        credentials: 'include',
      })
      setTimeout(() => this._ws?.close(), 0)
    })

    this.on('neemata/ping', () =>
      this.send(MessageType.Event, { event: 'neemata/pong' })
    )
  }

  send(event: MessageType, payload: any) {
    this._ws?.send(
      JSON.stringify({
        type: event,
        payload,
      })
    )
  }

  createStream(data: Blob | File): Stream {
    const stream = new Stream(this, data)
    this._streams.set(stream.id, stream)
    stream.once('finish', () => this._streams.delete(stream.id))
    return stream
  }

  connect() {
    if (this._prefer === Transport.Ws) {
      if (pingInterval) clearInterval(pingInterval)
      pingInterval = setInterval(async () => {
        if (!this.isActive) return
        const resultPromise = Promise.race([
          new Promise((r) =>
            setTimeout(() => r(false), this._options.pingTimeout)
          ),
          new Promise((r) => this.once('neemata/pong', () => r(true))),
        ])
        this.send(MessageType.Event, { event: 'neemata/ping' })
        const result = await resultPromise
        if (!result) this._ws?.close()
      }, this._options.pingInterval)

      this._connecting = new Promise((resolve) => {
        this._waitHealthy().then(() => {
          const ws = new window.WebSocket(this._getWsUrl())

          ws.addEventListener(
            'open',
            () => {
              this.emit('neemata/connect')
              resolve()
            },
            { once: true }
          )

          ws.addEventListener(
            'error',
            (err) => {
              console.error(err)
              this.emit('neemata/error', err)
              ws.close()
            },
            { once: true }
          )

          ws.addEventListener('message', (message) => {
            try {
              const { type, payload } = JSON.parse(message.data)
              if (type === MessageType.Event)
                this.emit(payload.event, payload.data)
              else if (type === MessageType.Call) {
                const { correlationId, error, data } = payload
                const call = this._calls.get(correlationId)
                if (call) {
                  this._calls.delete(correlationId)
                  if (payload.error) {
                    call.reject(
                      new NeemataError(error.code, error.message, data)
                    )
                  } else call.resolve(data)
                } else console.warn('Unknown message', payload)
              }
            } catch (err) {
              console.error(err)
            }
          })

          ws.addEventListener(
            'close',
            () => {
              this._calls.forEach(({ reject }) =>
                reject(new Error('Connection closed'))
              )
              this._streams.clear()
              this._correlationId = 0
              this._calls.clear()
              this.emit('neemata/disconnect')
              this.connect()
            },
            { once: true }
          )

          this._ws = ws
        })
      })
    } else {
      this._connecting = this._waitHealthy()
    }

    return this._connecting
  }

  call<
    Response extends GetOrUnknown<Api[P], 'output'>,
    P extends Procedures = Procedures
  >(...args: CallArgs<Api, P>): Promise<Response>
  async call(procedure: string, data?: any) {
    await this._connecting

    const streams: Promise<any>[] = []
    const serialize = async (data: any) => {
      const result = JSON.stringify(data, (key, value) => {
        if (value instanceof Stream) {
          //@ts-expect-error
          streams.push(value._init())
          //@ts-expect-error
          return value._serialize()
        }
        return value
      })
      await Promise.all(streams)
      return result
    }

    if (this._prefer === Transport.Http) {
      if (streams.length)
        throw new Error('Streams are not supported in HTTP transport')

      const options: RequestInit = {
        method: 'POST',
        body: await serialize(data),
        headers: {
          'content-type': 'application/json',
        },
      }

      return fetch(
        this._getUrl((procedure as string).split('.').join('/'), {
          credentials: 'include',
        }),
        options
      )
        .catch((err) => {
          console.error(err)
          throw new NeemataError(
            ErrorCode.ClientRequestError,
            '[HTTP channel] request error'
          )
        })
        .then((res) => res.json())
        .catch((err) => {
          console.error(err)
          throw new NeemataError(
            ErrorCode.ClientRequestError,
            '[HTTP channel] parse error'
          )
        })
        .then(({ error, data }) => {
          return error
            ? Promise.reject(new NeemataError(error.code, error.message, data))
            : Promise.resolve(data)
        })
    } else {
      const call = new Promise((resolve, reject) => {
        const correlationId = (++this._correlationId).toString()
        serialize({
          type: MessageType.Call,
          payload: { correlationId, procedure, data },
        }).then((serialized) => this._ws?.send(serialized))
        // @ts-ignore
        this._calls.set(correlationId, { resolve, reject })
      })
      return call
    }
  }
  async reconnect() {
    this._ws?.close()
    return new Promise((resolve) => this.once('neemata/connect', resolve))
  }

  get isActive() {
    return [window.WebSocket.OPEN, window.WebSocket.CONNECTING].includes(
      // @ts-ignore
      this._ws?.readyState
    )
  }

  private _getUrl(path?: string, query?: Record<string, string>) {
    const url = new URL(path ?? '', this._url)
    if (query) {
      for (const [name, value] of Object.entries(query)) {
        url.searchParams.set(name, value)
      }
    }
    return url
  }

  private _getWsUrl() {
    const url = this._getUrl()
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    return url
  }

  private async _waitHealthy() {
    let healhy = false

    while (!healhy) {
      healhy = await fetch(this._getUrl('neemata/healthy'), {
        method: 'GET',
        credentials: 'include',
      })
        .then((r) => r.ok)
        .catch((err) => false)
      if (!healhy) await new Promise((r) => setTimeout(r, 1000))
    }
  }
}

export const NeemataClient = Neemata
