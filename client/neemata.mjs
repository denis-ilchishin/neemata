import { MessageType, Protocol } from './lib/enums'
import { ErrorCode } from './lib/enums.mjs'
import { EventEmitter } from './lib/event-emitter'

// const rooms = new Map()

// function createRooms(ws) {
//   ws.addEventListener('message', ({ data }) => {
//     const { type, payload } = JSON.parse(data)
//     if (type === MessageType.Room) {
//       const { room: roomId, action, event, data } = payload
//       if (action === 'message' && roomId && event) {
//         const room = rooms.get(roomId)
//         if (room) room.emit(event, data)
//       }
//     }
//   })

//   const join = (roomId) =>
//     new Promise((r) => {
//       let room = rooms.get(roomId)
//       if (!room) {
//         const handler = ({ data }) => {
//           const { type, payload } = JSON.parse(data)
//           if (type === MessageType.Room) {
//             const { room: roomId, action } = payload
//             if (action === 'join' && roomId) {
//               room = rooms.get(roomId)
//               if (!room) {
//                 room = new EventEmitter()
//                 room.leave = leave.bind(null, roomId)
//                 rooms.set(roomId, room)
//               }
//               ws.removeEventListener('message', handler)
//               r(room)
//             }
//           }
//         }
//         ws.addEventListener('message', handler)
//         ws.send(
//           JSON.stringify({
//             type: 'room',
//             payload: { room: roomId, action: 'join' },
//           })
//         )
//       } else {
//         r(room)
//       }
//     })

//   const leave = (roomId) => {
//     new Promise((r) => {
//       let room = rooms.get(roomId)
//       if (room) {
//         const handler = ({ data }) => {
//           const { type, payload } = JSON.parse(data)
//           if (type === MessageType.Room) {
//             const { room: roomId, action } = payload
//             if (action === 'leave' && roomId) {
//               rooms.delete(roomId)
//               ws.removeEventListener('message', handler)
//               r()
//             }
//           }
//         }
//         ws.addEventListener('message', handler)
//         ws.send(
//           JSON.stringify({
//             type: 'room',
//             payload: { room: roomId, action: 'leave' },
//           })
//         )
//       }
//     })
//   }

//   return {
//     join,
//     leave,
//     _rooms: rooms,
//   }
// }

export function createNeemata(options) {
  const prefer = options.preferHttp ? Protocol.Http : Protocol.Ws
  const baseUrl = options?.baseUrl ?? '/api'
  const httpUrl = new URL(baseUrl, options.url)
  const wsUrl = new URL(
    baseUrl,
    `${httpUrl.protocol === 'https' ? 'wss' : 'ws'}://${httpUrl.host}`
  )

  const auth = () => (options.auth ? options.auth() : null)

  let ws

  const emitter = new EventEmitter()
  const api = {}

  async function request({ module, protocol, url, data, version }) {
    if (protocol === Protocol.Http) {
      return fetch(`${httpUrl}/${url}`, {
        body: data,
        method: 'POST',
        headers: { Authorization: 'Token ' + auth() },
      })
        .then((res) => res.json())
        .then(({ error, data }) => {
          return Promise[error ? 'reject' : 'resolve']({ error, data })
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
    } else {
      const req = new Promise((resolve, reject) => {
        const messageId = crypto.randomUUID()
        const cb = ({ data: rawMessage }) => {
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
            ws.removeEventListener('message', cb)
          }
        }

        ws.addEventListener('message', cb)
        ws.send(
          JSON.stringify({
            type: MessageType.Api,
            payload: { messageId, module, data },
          })
        )
      })

      return req
    }
  }

  async function introspect() {
    const modules = await fetch(httpUrl + '/introspect').then((res) =>
      res.json()
    )

    for (const [name, { url, protocol }] of Object.entries(modules)) {
      const parts = name.split('.')
      let last = api

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
                request({
                  module: name,
                  protocol: protocol ?? _protocol ?? prefer,
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

  function connect() {
    return new Promise((r) => {
      ws.addEventListener('open', async () => {
        await introspect()
        r()
      })
    })
  }

  let connecting = false
  let neemata

  function init() {
    const _auth = auth()

    if (_auth) {
      wsUrl.searchParams.set('authorization', `Token ${_auth}`)
    }
    connecting = true

    ws = new window.WebSocket(wsUrl.toString())

    if (neemata) neemata.ws = ws

    ws.addEventListener('error', (err) => {
      console.error(err)
      if (connecting === true) {
        connecting = false
        ws.close()
      }
    })

    ws.addEventListener('open', () => {
      console.log('Connection opened')
      clearTimeout(reconnectTimeout)
      neemata.rooms = createRooms(ws)
      connecting = false
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
      console.log('Connection closed', { connecting })
      reconnect()
    })
  }

  let reconnectTimeout = null

  function reconnect() {
    if (reconnectTimeout) clearTimeout(reconnectTimeout)
    reconnectTimeout = setTimeout(() => {
      console.log('Reconnecting...', { connecting, ws })
      if (!connecting) init()
      else reconnect()
    }, 2500)
  }

  init()

  emitter.on('reload', introspect)

  neemata = Object.assign(emitter, {
    api,
    connect,
    ws,
  })

  return neemata
}
