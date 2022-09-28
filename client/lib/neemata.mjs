import { ErrorCode, MessageType, Protocol } from './enums.mjs'
import { EventEmitter } from './event-emitter.mjs'

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

export class Neemata extends EventEmitter {
  ws = null
  connecting = null
  auth = null
  api = {}

  constructor({
    host,
    preferHttp = false,
    basePath = '/api',
    autoreconnect = true,
    ping = 30 * 1000,
  }) {
    super()

    this.httpUrl = new URL(basePath, host)
    this.prefer = preferHttp ? Protocol.Http : Protocol.Ws
    this.autoreconnect = autoreconnect
    this.ping = ping ? parseInt(ping) : false

    // Check ws connection after reopening browser/tab,
    // specifically for mobile devices when switching between apps
    if (!preferHttp && typeof window !== 'undefined') {
      const onForeground = () => {
        if (!window.document.hidden && !this.wsActive && !this.connecting)
          this.connect()
      }

      window.addEventListener('focus', onForeground, { passive: true })
      window.document.addEventListener('visibilitychange', onForeground, {
        passive: true,
      })
    }

    // Reintrospect API on reload
    this.on('neemata:reload', async () => {
      await this.connecting
      this.connecting = this.introspect()
    })
  }

  setAuth(token) {
    this.auth = token ? `Token ${token}` : null
  }

  async introspect() {
    const api = await fetch(`${this.httpUrl}/neemata/introspect`, {
      headers: this.auth ? { authorization: this.auth } : {},
    }).then((res) => res.json())

    const modules = new Set(api.map(({ name }) => name))

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
                  (data, { protocol: _protocol, ...options } = {}) =>
                    this._api(moduleName, data, {
                      ...options,
                      protocol: module.protocol ?? _protocol ?? this.prefer,
                      version: module.version,
                    }),
                  _prev
                ),
              })
            } else {
              Object.defineProperty(
                last[part],
                `v${module.version.replace('.', '_')}`,
                {
                  configurable: false,
                  enumerable: true,
                  value: (data, { protocol: _protocol, ...options } = {}) =>
                    this._api(moduleName, data, {
                      ...options,
                      protocol: module.protocol ?? _protocol ?? this.prefer,
                      version: module.version,
                    }),
                }
              )
            }
          }
        } else {
          last = last[part]
        }
      }
      moduleName
    }
  }

  async _api(module, data, { protocol, formData, version = '1' } = {}) {
    await this.connecting

    if (
      this.prefer === Protocol.Http ||
      protocol === Protocol.Http ||
      formData
    ) {
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
        const messageId = randomUUID()
        const handler = ({ data: rawMessage }) => {
          try {
            const { type, payload } = JSON.parse(rawMessage)
            if (
              type === MessageType.Api &&
              payload.messageId === messageId &&
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
            payload: { messageId, module, data, version },
          })
        )
      })

      return req
    }
  }

  connect() {
    if (this.prefer === Protocol.Ws) {
      this.connecting = new Promise((resolve) => {
        this.waitHealthy().then(async () => {
          await this.introspect()
          const wsSchema = this.httpUrl.protocol === 'https:' ? 'wss' : 'ws'
          const wsUrl = new URL(
            this.httpUrl.pathname,
            `${wsSchema}://${this.httpUrl.host}`
          )
          if (this.auth) wsUrl.searchParams.set('authorization', this.auth)
          const ws = (this.ws = new window.WebSocket(wsUrl))

          let pingInterval

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
              if (type === MessageType.Server && payload.event)
                this.emit(payload.event, payload.data)
            } catch (err) {
              console.error(err)
            }
          })

          ws.addEventListener(
            'close',
            () => {
              this.emit('neemata:disconnect')
              if (pingInterval) clearInterval(pingInterval)
              if (this.autoreconnect) this.connect()
            },
            { once: true }
          )

          ws.addEventListener(
            'open',
            () => {
              this.emit('neemata:connect')
              setTimeout(resolve, 0)

              if (this.ping) {
                pingInterval = setInterval(() => {
                  ws.send(
                    JSON.stringify({
                      type: MessageType.Server,
                      payload: {
                        event: 'neemata:ping',
                      },
                    })
                  )
                }, this.ping)
              }
            },
            { once: true }
          )
        })
      })
    } else {
      this.connecting = this.waitHealthy().then(() => this.introspect())
    }

    return this.connecting
  }

  async waitHealthy() {
    let healhy = false

    while (!healhy) {
      healhy = await fetch(`${this.httpUrl}/neemata/health`, { method: 'GET' })
        .then((r) => r.ok)
        .catch((err) => false)
      if (!healhy) await new Promise((r) => setTimeout(r, 1000))
    }
  }

  async reconnect() {
    await this.ws?.close()
    if (!this.autoreconnect) return this.connect()
    else return new Promise((resolve) => this.once('neemata:connect', resolve))
  }

  get wsState() {
    return this.ws?.readyState
  }

  get wsActive() {
    return [window.WebSocket.OPEN, window.WebSocket.CONNECTING].includes(
      this.wsState
    )
  }
}
