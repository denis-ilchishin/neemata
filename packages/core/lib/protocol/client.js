'use strict'

const EventEmitter = require('node:events')
const { MessageType, Transport } = require('@neemata/common')
const { randomUUID } = require('node:crypto')

module.exports = {
  createClient({ socket, session, auth = null, clearSession = () => {} }) {
    const client = Object.assign(new EventEmitter(), {
      id: randomUUID(),
      auth,
      session,
      transport: socket ? Transport.Ws : Transport.Http,
      clearSession,
    })

    if (socket) {
      Object.assign(client, {
        socket,
        send: (event, data) => socket.send(MessageType.Event, { event, data }),
        openedAt: new Date(),
        closedAt: null,
      })
      socket.once('close', () => {
        client.closedAt = new Date()
        client.emit('close')
      })
    }

    return client
  },
}
