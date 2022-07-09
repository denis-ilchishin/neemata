import { ErrorCode, MessageType, Protocol } from './enums.mjs'
import { EventEmitter } from './event-emitter.mjs'

// TODO: ssr friendly (without fetch? polyfil? ws?)
export class Neemata extends EventEmitter {
  ws = null
  connecting = false
  auth = null
  api = {}

  constructor({
    host,
    preferHttp = false,
    basePath = '/api',
    autoreconnect = 1500,
  }) {
    super()

    this.httpUrl = new URL(basePath, host)
    this.wsUrl = new URL(
      basePath,
      `${this.httpUrl.protocol === 'https' ? 'wss' : 'ws'}://${
        this.httpUrl.host
      }`
    )
    this.prefer = preferHttp ? Protocol.Http : Protocol.Ws
    this.autoreconnect = autoreconnect

    this.on('neemata:reload', this._introspect.bind(this))
  }

  setAuth(token) {
    this.auth = token ? `Token ${token}` : null
  }

  async _introspect() {
    const modules = await fetch(`${this.httpUrl}/introspect`).then((res) =>
      res.json()
    )

    this.api = {}

    for (const [name, { url, protocol }] of Object.entries(modules)) {
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
              (data, { version = '*', protocol: _protocol } = {}) =>
                this._request({
                  module: name,
                  protocol: protocol ?? _protocol ?? this.prefer,
                  url,
                  data,
                  version,
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

  async _request({ module, protocol, url, data, version = '*' }) {
    if (protocol === Protocol.Http) {
      return fetch(`${this.httpUrl}/${url}`, {
        body: data,
        method: 'POST',
        headers: {
          Authorization: this.auth,
          'Accept-Version': version,
        },
      })
        .catch((err) => {
          console.error(err)
          return {
            error: {
              code: ErrorCode.RequestError,
              message: 'CLIENT_HTTP_CHANNEL_REQUEST_ERROR',
            },
          }
        })
        .then((res) => res.json())
        .catch((err) => {
          console.error(err)
          return {
            error: {
              code: ErrorCode.RequestError,
              message: 'CLIENT_HTTP_CHANNEL_PARSE_ERROR',
            },
          }
        })
        .then(({ error, data }) => {
          return Promise[error ? 'reject' : 'resolve']({ error, data })
        })
    } else {
      const req = new Promise((resolve, reject) => {
        const messageId = crypto.randomUUID()
        const handler = ({ data: rawMessage }) => {
          try {
            const { type, payload } = JSON.parse(rawMessage)

            if (
              type === MessageType.Api &&
              payload.messageId === messageId &&
              payload.module === module
            ) {
              if (payload.error)
                reject({ error: payload.error, data: payload.data })
              else resolve(payload.data)
            }
          } catch (error) {
            console.error(error)
            reject({
              error: {
                code: ErrorCode.RequestError,
                message: 'CLIENT_WS_CHANNEL_MESSAGE_PARSE_ERROR',
              },
            })
          } finally {
            this.ws.removeEventListener('message', handler)
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
    this.ws.readyState
  }

  async connect() {
    return new Promise((resolve) => {
      this.connecting = true

      this.wsUrl.searchParams.set('authorization', this.auth)

      const ws = new window.WebSocket(this.wsUrl)

      ws.addEventListener('open', () => {
        this.connecting = false
        this.emit('neemata:connect')
        this._introspect().then(resolve)
      })

      ws.addEventListener('error', (err) => {
        console.error(err)
        this.emit('neemata:error', err)
        // TODO: add server ping?
        ws.close()
      })

      ws.addEventListener('message', (message) => {
        try {
          const { type, event, payload } = JSON.parse(message.data)
          if (type === MessageType.Server && event) emitter.emit(event, payload)
        } catch (err) {
          console.error(err)
        }
      })

      ws.addEventListener('close', () => {
        this.emit('neemata:disconnect')
        if (this.autoreconnect)
          setTimeout(() => this.connect(), this.autoreconnect)
      })

      this.ws = ws
    })
  }

  reconnect() {
    this.ws?.close()
    if (!this.autoreconnect) this.connect()
  }
}
