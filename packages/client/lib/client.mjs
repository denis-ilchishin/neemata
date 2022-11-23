import { ErrorCode, MessageType, Transport } from '@neemata/common'
import events from 'events'

const randomUUID = () =>
  typeof crypto.randomUUID !== 'undefined'
    ? crypto.randomUUID()
    : ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c) =>
        (
          c ^
          (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))
        ).toString(16)
      )

export class NeemataError extends Error {
  constructor(code, message, data) {
    super(message)
    this.name = code
    this.data = data
  }
}

export class Neemata extends events.EventEmitter {
  ws = null
  connecting = null
  auth = null
  api = {}

  constructor({ host, preferHttp = false, basePath = '/api' }) {
    super()

    this.httpUrl = new URL(basePath, host)
    this.prefer = preferHttp ? Transport.Http : Transport.Ws

    // Neemata internal events
    this.on('neemata:reload', () => this.introspect())
    this.on('neemata:ping', () =>
      this.ws.send(
        JSON.stringify({
          type: MessageType.Message,
          payload: { event: 'neemata:pong' },
        })
      )
    )
  }

  setAuth(token) {
    this.auth = token ? `Token ${token}` : null
  }

  async introspect() {
    const api = await fetch(`${this.httpUrl}/neemata/introspect`, {
      headers: this.auth ? { authorization: this.auth } : {},
    }).then((res) => res.json())

    const modules = new Set(api.map(({ name }) => name))
    this.api = {}

    for (const moduleName of modules) {
      const versions = api.filter(({ name }) => name === moduleName)

      const parts = moduleName.split('.')
      let last = this.api

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i]
        last[part] = last[part] ?? {}

        if (i === parts.length - 1) {
          const _prev = last[part]

          for (const module of versions) {
            if (module.version === '1') {
              Object.defineProperty(last, part, {
                configurable: false,
                enumerable: true,
                value: Object.assign(
                  (data, { transport: _transport, ...options } = {}) =>
                    this._api(moduleName, data, {
                      ...options,
                      transport: module.transport ?? _transport ?? this.prefer,
                      version: module.version,
                    }),
                  _prev
                ),
              })
            } else {
              Object.defineProperty(last[part], `v${module.version}`, {
                configurable: false,
                enumerable: true,
                value: (data, { transport: _transport, ...options } = {}) =>
                  this._api(moduleName, data, {
                    ...options,
                    transport: module.transport ?? _transport ?? this.prefer,
                    version: module.version,
                  }),
              })
            }
          }
        } else {
          last = last[part]
        }
      }
      moduleName
    }
  }

  async _api(module, data, { transport, formData, version = '1' } = {}) {
    await this.connecting

    if (transport === Transport.Http || formData) {
      const options = {
        method: 'POST',
        headers: {
          'accept-version': version,
        },
      }

      if (typeof data !== 'undefined') {
        options.headers['content-type'] = formData
          ? 'multipart/form-data'
          : 'application/json'
        options.body = formData ? data : JSON.stringify(data)
      }

      if (this.auth) {
        options.headers.authorization = this.auth
      }

      return fetch(`${this.httpUrl}/${module.split('.').join('/')}`, options)
        .catch((err) => {
          console.error(err)
          throw new NeemataError(
            ErrorCode.RequestError,
            'HTTP channel request error'
          )
        })
        .then((res) => res.json())
        .catch((err) => {
          console.error(err)
          throw new NeemataError(
            ErrorCode.RequestError,
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
        const handler = ({ data: rawMessage }) => {
          try {
            const { type, payload } = JSON.parse(rawMessage)
            if (
              type === MessageType.Api &&
              payload.correlationId === correlationId &&
              payload.module === module
            ) {
              this.ws.removeEventListener('message', handler)
              if (payload.error)
                reject(
                  new NeemataError(
                    payload.error.code,
                    payload.error.message,
                    payload.data
                  )
                )
              else resolve(payload.data)
            }
          } catch (error) {
            this.ws.removeEventListener('message', handler)
            console.error(error)
            reject(
              new NeemataError(
                ErrorCode.RequestError,
                'WS channel message parse error'
              )
            )
          }
        }

        this.ws.addEventListener('message', handler)
        this.ws.send(
          JSON.stringify({
            type: MessageType.Api,
            payload: { correlationId, module, data, version },
          })
        )
      })

      return req
    }
  }

  async _waitHealthy() {
    let healhy = false

    while (!healhy) {
      healhy = await fetch(`${this.httpUrl}/neemata/healthy`, { method: 'GET' })
        .then((r) => r.ok)
        .catch((err) => false)
      if (!healhy) await new Promise((r) => setTimeout(r, 1000))
    }
  }

  connect() {
    if (this.prefer === Transport.Ws) {
      this.connecting = new Promise((resolve) => {
        this._waitHealthy()
          .then(() => this.introspect())
          .catch((err) => {
            this.connect()
            throw err
          })
          .then(() => {
            const wsUrl = new URL(
              this.httpUrl.pathname,
              `${this.httpUrl.protocol === 'https:' ? 'wss' : 'ws'}://${
                this.httpUrl.host
              }`
            )
            if (this.auth) wsUrl.searchParams.set('authorization', this.auth)
            const ws = (this.ws = new window.WebSocket(wsUrl))

            events.once(ws, 'error', () => {
              console.error(err)
              this.dispatchEvent(new Event('neemata:error', err))
              ws.close()
            })

            events.on(ws, 'message', (message) => {
              try {
                const { type, payload } = JSON.parse(message.data)
                if (type === MessageType.Message && payload.event)
                  this.dispatchEvent(new Event(payload.event, payload.data))
              } catch (err) {
                console.error(err)
              }
            })

            events.once(ws, 'close', () => {
              this.dispatchEvent(new Event('neemata:disconnect'))
              this.connect()
            })

            events.once(ws, 'open', () => {
              this.dispatchEvent(new Event('neemata:connect'))
              setTimeout(resolve, 0)
            })
          })
      })
    } else {
      this.connecting = this._waitHealthy().then(() => this.introspect())
    }

    return this.connecting
  }

  async reconnect() {
    await this.ws?.close()
    return new Promise((resolve) => this.once('neemata:connect', resolve))
  }

  get isActive() {
    return [window.WebSocket.OPEN, window.WebSocket.CONNECTING].includes(
      this.ws?.readyState
    )
  }
}
