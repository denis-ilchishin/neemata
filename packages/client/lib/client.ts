import type { ApiIntrospectResponse, ValueOf } from '@neemata/common'
import { ErrorCode, MessageType, Transport } from '@neemata/common'
import { EventEmitter } from 'events'
import { Stream } from './stream'
import type { ApiConstructOptions, NeemataOptions } from './utils'
import { NeemataError, randomUUID } from './utils'

// TODO: refactor this mess

export class Neemata<T = any> extends EventEmitter {
  api: T = {} as T
  _ws?: WebSocket

  private _connecting: Promise<void> | null = null
  private _url: URL
  private _prefer: ValueOf<typeof Transport>
  private _streams: Map<string, Stream>

  constructor({ host, preferHttp = false }: NeemataOptions) {
    super()

    this._url = new URL(host)
    this._prefer = preferHttp ? Transport.Http : Transport.Ws
    this._streams = new Map()

    // Neemata internal events
    this.on('neemata:stream:init', ({ id }) =>
      this._streams.get(id)?.emit('init')
    )
    this.on('neemata:stream:pull', ({ id }) =>
      this._streams.get(id)?.emit('pull')
    )
    this.on('neemata:introspect', (data) => this._scaffold(data))
    this.on('neemata:ping', () =>
      this._ws?.send(
        JSON.stringify({
          type: MessageType.Event,
          payload: { event: 'neemata:pong' },
        })
      )
    )
  }

  createStream(data: Blob | File) {
    const stream = new Stream(this, data)
    this._streams.set(stream.id, stream)
    stream.once('finish', () => this._streams.delete(stream.id))
    return stream
  }

  _getUrl(path: string, query?: Record<string, string>) {
    const url = new URL(path, this._url)
    if (query) {
      for (const [name, value] of Object.entries(query)) {
        url.searchParams.set(name, value)
      }
    }
    return url
  }

  _getWsUrl() {
    const url = this._getUrl('')
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    return url
  }

  async _scaffold(data: ApiIntrospectResponse) {
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
              this._send(procedureName, data, {
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
  }

  connect() {
    if (this._prefer === Transport.Ws) {
      this._connecting = new Promise((resolve) => {
        this._waitHealthy()
          .catch((err) => {
            this.connect()
            throw err
          })
          .then(() => {
            this.once('neemata:introspect', () => setTimeout(resolve, 0))
            const wsUrl = this._getWsUrl()
            const ws = new window.WebSocket(wsUrl)

            ws.addEventListener(
              'error',
              (err) => {
                console.error(err)
                this.emit('neemata:error', err)
                ws.close()
              },
              { once: true }
            )

            ws.addEventListener('message', (message) => {
              try {
                const { type, payload } = JSON.parse(message.data)
                if (type === MessageType.Event)
                  this.emit(payload.event, payload.data)
              } catch (err) {
                console.error(err)
              }
            })

            ws.addEventListener(
              'close',
              () => {
                this.emit('neemata:disconnect')
                this.connect()
                this._streams.clear()
              },
              { once: true }
            )

            ws.addEventListener(
              'open',
              () => {
                this.emit('neemata:connect')
                setTimeout(resolve, 0)
              },
              { once: true }
            )

            this._ws = ws
          })
      })
    } else {
      this._connecting = this._waitHealthy().then(async () => {
        const data = await fetch(this._getUrl('neemata/introspect')).then(
          (res) => res.json()
        )
        this._scaffold(data)
      })
    }

    return this._connecting
  }

  async reconnect() {
    this._ws?.close()
    return new Promise((resolve) => this.once('neemata:connect', resolve))
  }

  get isActive() {
    return [window.WebSocket.OPEN, window.WebSocket.CONNECTING].includes(
      this._ws?.readyState!
    )
  }

  async _send(
    procedure: string,
    data: any,
    { transport, version = 1 }: ApiConstructOptions = {}
  ) {
    await this._connecting

    const streams: Promise<any>[] = []
    const serialize = async (data) => {
      const result = JSON.stringify(data, (key, value) => {
        if (value instanceof Stream) {
          if (value.streaming) throw new Error('Stream already initialized')
          if (!value.initialized) streams.push(value._init())
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

      return fetch(this._getUrl(procedure.split('.').join('/')), options)
        .catch((err) => {
          console.error(err)
          throw new NeemataError(
            ErrorCode.ClientRequestError,
            'HTTP channel request error'
          )
        })
        .then((res) => res.json())
        .catch((err) => {
          console.error(err)
          throw new NeemataError(
            ErrorCode.ClientRequestError,
            'HTTP channel parse error'
          )
        })
        .then(({ error, data }) => {
          return error
            ? Promise.reject(new NeemataError(error.code, error.message, data))
            : Promise.resolve(data)
        })
    } else {
      const req = new Promise((resolve, reject) => {
        const correlationId = randomUUID()
        const handler = ({ data: rawMessage }: MessageEvent) => {
          try {
            const { type, payload } = JSON.parse(rawMessage)
            if (
              type === MessageType.Call &&
              payload.correlationId === correlationId &&
              payload.procedure === procedure
            ) {
              this._ws?.removeEventListener('message', handler)
              const { error, data } = payload
              if (payload.error)
                reject(new NeemataError(error.code, error.message, data))
              else resolve(data)
            }
          } catch (error) {
            this._ws?.removeEventListener('message', handler)
            console.error(error)
            reject(
              new NeemataError(
                ErrorCode.ClientRequestError,
                'WS channel message parse error'
              )
            )
          }
        }

        this._ws?.addEventListener('message', handler)
        serialize({
          type: MessageType.Call,
          payload: { correlationId, procedure, data, version },
        }).then((serialized) => this._ws?.send(serialized))
      })

      return req
    }
  }

  async _waitHealthy() {
    let healhy = false

    while (!healhy) {
      healhy = await fetch(this._getUrl('neemata/healthy'), { method: 'GET' })
        .then((r) => r.ok)
        .catch((err) => false)
      if (!healhy) await new Promise((r) => setTimeout(r, 1000))
    }
  }
}

export const NeemataClient = Neemata
