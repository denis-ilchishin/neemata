'use strict'

const { createClient } = require('./client')
const { BaseTransport } = require('./transport')
const { MessageType, Transport, WorkerHook } = require('@neemata/common')
const { Stream } = require('./stream')
const { parse } = require('node:url')
const Zod = require('zod');

const AUTH_KEY = Symbol()
const HTTP_SUFFIX = '\r\n\r\n'


const messageSchema = Zod.discriminatedUnion('type', [
  Zod.object({
    type: Zod.literal(MessageType.Call),
    payload: Zod.object({
      correlationId: Zod.string().optional(),
      procedure: Zod.string(),
      data: Zod.any().optional().default(undefined),
    }),
  }),
  Zod.object({
    type: Zod.literal(MessageType.Event),
    payload: Zod.object({
      event: Zod.string(),
      data: Zod.any().optional().default(undefined),
    }),
  }),
]);

class WsTransport extends BaseTransport {
  constructor(server) {
    super(server)
    this.type = Transport.Ws

    this.server.httpServer.on('upgrade', async (req, connection, head) => {
      if (parse(req.url).pathname !== '/') {
        connection.write('HTTP/1.1 404 NotFound' + HTTP_SUFFIX)
        return connection.destroy()
      }

      try {
        req[AUTH_KEY] = await this.server.handleAuth({
          req,
        })
      } catch (error) {
        connection.write('HTTP/1.1 401 Unauthorized' + HTTP_SUFFIX)
        return connection.destroy()
      }

      this.server.wsServer.handleUpgrade(
        req,
        connection,
        head,
        (socket, req) => {
          const client = createClient({
            socket,
            auth: req[AUTH_KEY],
          })
          this.server.wsServer.emit('connection', socket, req, client)
        }
      )
    })

    this.server.wsServer.on('connection', (socket, req, client) => {
      this.server.wsClients.set(client.id, client)
      const _send = socket.send.bind(socket)
      socket.send = (type, payload) => _send(this.serialize({ type, payload }))
      socket.on('error', (err) => logger.error(err))
      const hookArgs = { client, req }
      client.on('close', async () => {
        await this.server.application.runHooks(
          WorkerHook.Disconnect,
          true,
          hookArgs
        )
        this.server.wsClients.delete(client.id)
      })
      const onConnect = this.server.application.runHooks(
        WorkerHook.Connect,
        true,
        hookArgs
      )
      this.receiver(socket, req, client, onConnect)
    })
  }

  deserialize(raw) {
    return JSON.parse(raw, (key, value) => {
      if (
        value &&
        value['__type'] === 'neemata/stream' &&
        typeof value['__id'] === 'string'
      )
        return this.server.streams.get(value.__id)
      return value
    })
  }

  receiver(socket, req, client, onConnect) {
    socket.on('message', async (rawMessage) => {
      try {
        await onConnect
        const deserialized = this.deserialize(rawMessage)
        const parsed = await messageSchema.safeParseAsync(deserialized)
        if (!parsed.success) throw new Error('Invalid message')
        const message = parsed.data
        const result = await this[message.type](client, req, message.payload)
        if (typeof result !== 'undefined') socket.send(message.type, result)
      } catch (cause) {
        logger.error(new Error('Error during handling message', { cause }))
        if (cause.message === 'Invalid message') socket.terminate()
      }
    })

    // Handle introspection
    const introspectHandler = async () => {
      client.send(
        'neemata/introspect',
        await this.server.introspect(req, client)
      )
    }
    client.on('neemata/introspect', introspectHandler)
    this.server.application.on('reloaded', introspectHandler)

    // Handle ping/pong
    client.on('neemata/ping', () => client.send('neemata/pong'))
    const intervalValue = this.config.intervals.ping
    const interval = setInterval(async () => {
      const result = Promise.race([
        new Promise((r) => setTimeout(() => r(false), intervalValue / 2)),
        new Promise((r) => client.once('neemata/pong', () => r(true))),
      ])
      client.send('neemata/ping')
      if (await result) return
      else socket.close()
    }, intervalValue)

    // Handle streams
    client.on('neemata/stream/init', ({ id, size, type, name }) => {
      if (!this.server.streams.has(id)) {
        const stream = new Stream({ client, id, size, type, name })
        this.server.streams.set(stream.id, stream)
        stream.once('close', () => this.server.streams.delete(stream.id))
        client.send('neemata/stream/init', { id })
      }
    })
    client.on('neemata/stream/abort', ({ id, reason }) => {
      const stream = this.server.streams.get(id)
      if (stream && stream.client.session === client.session) {
        stream.destroy(reason)
        this.server.streams.delete(id)
      }
    })

    client.on('close', () => {
      if (interval) clearInterval(interval)
      this.server.application.off('reloaded', introspectHandler)
      for (const stream of this.server.streams) {
        if (stream.client === client) {
          this.server.streams.delete(stream.id)
          stream.destroy()
        }
      }
    })

    introspectHandler()
  }

  [MessageType.Event](client, req, { event, data }) {
    client.emit(event, data)
  }

  async [MessageType.Call](client, req, { correlationId, procedure, data }) {
    const correlationData = {
      correlationId,
      procedure,
    }
    procedure = this.findProcedure(procedure, Transport.Ws)
    const response = await this.handle({ procedure, client, data, req })

    return {
      ...correlationData,
      ...response,
    }
  }
}

module.exports = {
  WsTransport,
}
