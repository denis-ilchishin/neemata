'use strict'

const { createClient, Client } = require('./client')
const { Type } = require('@sinclair/typebox')
const { BaseTransport } = require('./transport')
const { MessageType, Transport, WorkerHook } = require('@neemata/common')
const { compileSchema } = require('../utils/functions')
const { Stream } = require('./stream')
const { parse } = require('node:url')
const { Scope } = require('../di')

const SESSION_KEY = Symbol()
const AUTH_KEY = Symbol()
const HTTP_SUFFIX = `\r\n\r\n`

const messageSchema = compileSchema(
  Type.Union([
    Type.Object({
      type: Type.Literal(MessageType.Call),
      payload: Type.Object({
        correlationId: Type.Optional(Type.String()),
        procedure: Type.String(),
        data: Type.Optional(Type.Any({ default: undefined })),
      }),
    }),
    Type.Object({
      type: Type.Literal(MessageType.Event),
      payload: Type.Object({
        event: Type.String(),
        data: Type.Optional(Type.Any({ default: undefined })),
      }),
    }),
  ])
)

class WsTransport extends BaseTransport {
  constructor(server) {
    super(server)
    this.type = Transport.Ws

    this.server.httpServer.on('upgrade', async (req, connection, head) => {
      if (parse(req.url).pathname !== '/') {
        connection.write('HTTP/1.1 404 NotFound' + HTTP_SUFFIX)
        return connection.destroy()
      }

      // TODO: add upgrade handler option to user application?

      this.server.wsServer.handleUpgrade(
        req,
        connection,
        head,
        (socket, req) => {
          const client = new Client({ socket })
          const _send = socket.send.bind(socket)
          socket.send = (type, payload) =>
            _send(this.serialize({ type, payload }))
          this.server.wsServer.emit('connection', socket, req, client)
        }
      )
    })

    this.server.wsServer.on('connection', (socket, req, client) => {
      this.server.clients.set(client.id, client)

      socket.on('error', (err) => logger.error(err))
      client.on('close', async () => {
        this.server.clients.delete(client.id)
      })
      this.receiver(socket, req, client)
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
    const resolveDependencies = (async () => {
      const auth = await this.handleAuth({ req, client })
      const container = await this.workerApp.container.factory('connection', {
        client,
        req,
        auth,
      })
      return { auth, container }
    })()

    socket.on('message', async (rawMessage) => {
      try {
        const { container, auth } = await resolveDependencies
        const deserialized = this.deserialize(rawMessage)
        const isValid = messageSchema.Check(deserialized)
        if (!isValid) throw new Error('Invalid message')
        const message = deserialized // messageSchema.Cast(deserialized)
        const result = await this[message.type](message.payload, {
          container,
          client,
          req,
          auth,
        })

        if (typeof result !== 'undefined') socket.send(message.type, result)
      } catch (error) {
        console.error(error)
        if (error.message === 'Invalid message') socket.terminate()
      }
    })

    // Handle ping/pong
    client.on('neemata/ping', () => client.send('neemata/pong'))
    const pingPongIntervalTime = this.config.intervals.ping
    const pingPongInterval = setInterval(async () => {
      const result = Promise.race([
        new Promise((r) =>
          setTimeout(() => r(false), pingPongIntervalTime / 2)
        ),
        new Promise((r) => client.once('neemata/pong', () => r(true))),
      ])
      client.send('neemata/ping')
      if (!(await result)) socket.close()
    }, pingPongIntervalTime)

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
      // Clear memory after close
      if (pingPongInterval) clearInterval(pingPongInterval)
      // this.server.application.off('reloaded', introspectHandler)
      for (const stream of this.server.streams) {
        if (stream.client === client) {
          this.server.streams.delete(stream.id)
          stream.destroy()
        }
      }
    })

    // introspectHandler()
  }

  [MessageType.Event]({ event, data }, { client }) {
    client.emit(event, data)
  }

  async [MessageType.Call](
    { correlationId, procedure, data },
    { client, auth, container, req }
  ) {
    const correlationData = {
      correlationId,
      procedure,
    }

    const response = await this.handle(
      procedure,
      await container.factory('call', { client, auth, procedure, req }),
      Transport.Ws,
      {
        client,
        auth,
        data,
        req,
      }
    )

    return {
      ...correlationData,
      ...response,
    }
  }
}

module.exports = {
  WsTransport,
}
