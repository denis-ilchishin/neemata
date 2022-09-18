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

// TODO: ssr friendly (without fetch? polyfil? ws?)
export class Neemata extends EventEmitter {
  ws = null
  connecting = null
  auth = null
  api = {}
  settings = {}

  constructor({
    host,
    preferHttp = false,
    basePath = '/api',
    autoreconnect = true,
  }) {
    super()

    this.httpUrl = new URL(basePath, host)
    this.wsUrl = new URL(
      basePath,
      `${this.httpUrl.protocol === 'https:' ? 'wss' : 'ws'}://${
        this.httpUrl.host
      }`
    )
    this.prefer = preferHttp ? Protocol.Http : Protocol.Ws
    this.autoreconnect = autoreconnect

    this.on('neemata:reload', this._introspect.bind(this))

    if (!preferHttp && typeof window !== 'undefined') {
      const onForeground = () => {
        if (!document.hidden && !this.connected) {
          this.connect()
        }
      }
      window.addEventListener('focus', onForeground)
      window.document.addEventListener('visibilitychange', onForeground)
    }
  }

  setAuth(token) {
    this.auth = token ? `Token ${token}` : null
  }

  async _introspect() {
    const { settings, api } = await fetch(`${this.httpUrl}/introspect`).then(
      (res) => res.json()
    )
    this.settings = settings

    this.api = {}

    for (const [name, { url, protocol }] of Object.entries(api)) {
      const parts = name.split('.')
      let last = this.api

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i]
        last[part] = last[part] ?? {}

        if (i === parts.length - 1) {
          const _prev = last[part]
          Object.defineProperty(last, part, {
            configurable: false,
            enumerable: true,
            value: Object.assign(
              (data, { version = '*', protocol: _protocol, formData } = {}) =>
                this._request({
                  module: name,
                  protocol: protocol ?? _protocol ?? this.prefer,
                  url,
                  data,
                  version,
                  formData,
                }),
              _prev
            ),
          })
        } else {
          last = last[part]
        }
      }
    }
  }

  async _request({ module, protocol, url, data, formData, version = '*' }) {
    await this.connecting

    if (protocol === Protocol.Http) {
      const options = {
        method: 'POST',
        headers: {
          'accept-version': version,
        },
      }

      if (data) {
        options.headers['content-type'] = formData
          ? 'multipart/form-data'
          : 'application/json'
        options.body = formData ? data : JSON.stringify(data)
      }

      if (this.auth) {
        options.headers.authorization = this.auth
      }

      return fetch(`${this.httpUrl}/${url}`, options)
        .catch((err) => {
          console.error(err)
          throw {
            error: {
              code: ErrorCode.RequestError,
              message: 'CLIENT_HTTP_CHANNEL_REQUEST_ERROR',
            },
          }
        })
        .then((res) => res.json())
        .catch((err) => {
          console.error(err)
          throw {
            error: {
              code: ErrorCode.RequestError,
              message: 'CLIENT_HTTP_CHANNEL_PARSE_ERROR',
            },
          }
        })
        .then(({ error, data }) => {
          return error ? Promise.reject({ error, data }) : Promise.resolve(data)
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
                reject({ error: payload.error, data: payload.data })
              else resolve(payload.data)
            }
          } catch (error) {
            this.ws.removeEventListener('message', handler)
            console.error(error)
            reject({
              error: {
                code: ErrorCode.RequestError,
                message: 'CLIENT_WS_CHANNEL_MESSAGE_PARSE_ERROR',
              },
            })
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

  get state() {
    return this.ws.readyState
  }

  get connected() {
    return [window.WebSocket.OPEN, window.WebSocket.CONNECTING].includes(
      this.state
    )
  }

  async connect() {
    if (this.prefer === Protocol.Http) {
      this.connecting = this._introspect()
      return this.connecting
    }

    this.connecting = new Promise((resolve) => {
      this.checkHealth().then(() => {
        this.wsUrl.searchParams.set('authorization', this.auth)
        const ws = (this.ws = new window.WebSocket(this.wsUrl))

        ws.addEventListener('error', (err) => {
          console.error(err)
          this.emit('neemata:error', err)
          ws.close()
        })

        ws.addEventListener('message', (message) => {
          try {
            const { type, payload } = JSON.parse(message.data)
            if (type === MessageType.Server && payload.event)
              this.emit(payload.event, payload.data)
          } catch (err) {
            console.error(err)
          }
        })

        ws.addEventListener('close', () => {
          this.emit('neemata:disconnect')
          if (this.autoreconnect) this.connect()
        })

        ws.addEventListener('open', async () => {
          await this._introspect()
          this.emit('neemata:connect')
          setTimeout(resolve, 0)
        })
      })
    })

    return this.connecting
  }

  async checkHealth() {
    let healhy = false

    while (!healhy) {
      healhy = await fetch(`${this.httpUrl}/health`, { method: 'GET' })
        .then((r) => r.ok)
        .catch((err) => false)
      if (!healhy) await new Promise((r) => setTimeout(r, 1000))
    }
  }

  async reconnect() {
    await this.ws?.close()
    if (!this.autoreconnect) return this.connect()
    else
      return new Promise((resolve) => {
        this.once('neemata:connect', resolve)
      })
  }
}
