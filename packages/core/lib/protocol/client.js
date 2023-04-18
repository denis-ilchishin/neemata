'use strict'

const EventEmitter = require('node:events')
const { MessageType, Transport } = require('@neemata/common')
const { randomUUID } = require('node:crypto')

class Client extends EventEmitter {
  id = randomUUID()

  constructor({ socket }) {
    super()
    this.transport = socket ? Transport.Ws : Transport.Http
    this.socket = socket

    if (socket) {
      this.openedAt = new Date()
      this.closedAt = null
      socket.once('close', () => {
        this.closedAt = new Date()
        this.emit('close')
      })
    }
  }

  send(event, data) {
    this.socket.send(MessageType.Event, { event, data })
  }
}

module.exports = {
  Client,
}
