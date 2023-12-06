import EventEmitter from 'node:events'

export const bindPortMessageHandler = (port: EventEmitter) => {
  port.on('message', (message) => {
    if (message && typeof message === 'object') {
      const { type, payload } = message
      port.emit(type, payload)
    }
  })
}

export const createBroadcastChannel = (name: string) => {
  const channel = new BroadcastChannel(name)
  const emitter = new EventEmitter()
  channel.onmessageerror = console.error
  channel.onmessage = (message) => {
    // @ts-ignore
    emitter.emit('message', message.data)
  }
  bindPortMessageHandler(emitter)
  const close = () => {
    channel.close()
    emitter.removeAllListeners()
  }
  return { emitter, channel, close }
}
