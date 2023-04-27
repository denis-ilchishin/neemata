import type { ApiIntrospectResponse, ValueOf } from '@neemata/common'
import { ErrorCode, MessageType, Transport } from '@neemata/common'
import { EventEmitter } from 'events'
import { Stream } from './stream'
import type { ApiConstructOptions, NeemataOptions } from './utils'
import { NeemataError } from './utils'

let pingInterval

type Resolve = (value: unknown) => any
type Reject = (reason: Error) => any

export class Neemata<T = any> extends EventEmitter {
  api: T = {} as T

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
    scaffold = false,
  }: NeemataOptions) {
    super()

    this._options = { host, preferHttp, pingInterval, pingTimeout, scaffold }
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
      await fetch(this.getUrl('neemata/session/clear'), {
        credentials: 'include',
      })
      setTimeout(() => this._ws?.close(), 0)
    })

    if (scaffold) {
      this.on('neemata/introspect', (data) => this._scaffold(data))
    } else {
      // Disable api object access if scaffold is not enabled
      Object.defineProperty(this, 'api', {
        get: () => {
          throw new Error(
            'Unable to access api object without `scaffold: true` '
          )
        },
      })
    }

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
          // await for scaffold if specified in options
          if (this._options.scaffold) {
            this.once('neemata/scaffold', () => {
              this.emit('neemata/connect')
              resolve()
            })
          }

          const ws = new window.WebSocket(this._getWsUrl())

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
              this.emit('neemata/disconnect')
              this._calls.forEach(({ reject }) =>
                reject(new Error('Connection closed'))
              )
              this._streams.clear()
              this._correlationId = 0
              this._calls.clear()
              this.connect()
            },
            { once: true }
          )

          // await for ws to connect if there's no need for scaffold
          if (!this._options.scaffold) {
            ws.addEventListener(
              'open',
              () => {
                this.emit('neemata/connect')
                resolve()
              },
              { once: true }
            )
          }

          this._ws = ws
        })
      })
    } else {
      this._connecting = this._waitHealthy().then(async () => {
        const data = await fetch(this.getUrl('neemata/introspect'), {
          credentials: 'include',
        }).then((res) => res.json())
        this._scaffold(data)
      })
    }

    return this._connecting
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

  getUrl(path?: string, query?: Record<string, string>) {
    const url = new URL(this._url)
    if (path) url.pathname = path
    if (query) {
      for (const [name, value] of Object.entries(query)) {
        url.searchParams.set(name, value)
      }
    }
    return url
  }

  private _getWsUrl() {
    const url = this.getUrl()
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    return url
  }

  private async _scaffold(data: ApiIntrospectResponse) {
    const procedures = new Set<string>(data.map(({ name }) => name))
    // @ts-expect-error
    this.api = {}

    for (const procedureName of procedures) {
      const versions = data.filter(({ name }) => name === procedureName)

      const parts = procedureName.split('.')
      let last: any = this.api

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i]
        last[part] = last[part] ?? {}

        if (i === parts.length - 1) {
          const _prev = last[part]

          for (const procedure of versions) {
            const value = (
              data: any,
              { transport: _transport, ...options }: ApiConstructOptions = {}
            ) =>
              this.call(procedureName, data, {
                ...options,
                transport: procedure.transport ?? _transport ?? this._prefer,
                version: procedure.version,
              })

            if (procedure.version === 1) {
              // alias for convenience
              Object.defineProperty(last, part, {
                configurable: false,
                enumerable: true,
                value: _prev ? Object.assign(value, _prev) : value,
              })
            }

            Object.defineProperty(last[part], `v${procedure.version}`, {
              configurable: false,
              enumerable: true,
              value,
            })
          }
        } else {
          last = last[part]
        }
      }
    }
    this.emit('neemata/scaffold')
  }

  async call(
    procedure: string,
    data: any,
    { transport, version = 1 }: ApiConstructOptions = {}
  ) {
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

    if (transport === Transport.Http) {
      if (streams.length)
        throw new Error('Streams are not supported in HTTP transport')

      const options: RequestInit = {
        method: 'POST',
        body: await serialize(data),
        headers: {
          'accept-version': version.toString(),
          'content-type': 'application/json',
        },
      }

      return fetch(
        this.getUrl(procedure.split('.').join('/'), {
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
          payload: { correlationId, procedure, data, version },
        }).then((serialized) => this._ws?.send(serialized))
        this._calls.set(correlationId, { resolve, reject })
      })
      return call
    }
  }

  private async _waitHealthy() {
    let healhy = false

    while (!healhy) {
      healhy = await fetch(this.getUrl('neemata/healthy'), {
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
