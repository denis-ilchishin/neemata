'use strict'

const EventEmitter = require('node:events')
const { MessageType, Transport } = require('@neemata/common')
const { randomUUID } = require('node:crypto')

module.exports = {
  createClient({ socket, auth = null }) {
    const client = Object.assign(new EventEmitter(), {
      id: randomUUID(),
      auth,
      transport: socket ? Transport.Ws : Transport.Http,
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
