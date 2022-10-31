const { randomUUID } = require('node:crypto')
const EventEmitter = require('node:events')

module.exports = {
  /**
   * @returns {import('./client').Client}
   */
  createClient(socket, sendToSocket) {
    const client = Object.assign(new EventEmitter(), {
      id: randomUUID(),
      openedAt: new Date(),
      closedAt: null,
      opened: true,
      auth: null,
      send: (event, data) => sendToSocket(socket, { event, data }),
    })

    socket.once('close', () => {
      client.opened = false
      client.closedAt = new Date()
      client.emit('close')
    })

    return client
  },
}
