'use strict'

const { createClient } = require('./client')
const { Type } = require('@sinclair/typebox')
const { BaseTransport } = require('./transport')
const { MessageType, Transport, WorkerHook } = require('@neemata/common')
const { compileSchema } = require('../utils/functions')
const { Stream } = require('./stream')
const { parse } = require('node:url')

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
      this.server.clients.set(client.id, client)
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
        this.server.clients.delete(client.id)
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
        const isValid = messageSchema.Check(deserialized)
        if (!isValid) throw new Error('Invalid message')
        const message = deserialized // messageSchema.Cast(deserialized)
        const result = await this[message.type](client, req, message.payload)
        if (typeof result !== 'undefined') socket.send(message.type, result)
      } catch (error) {
        console.error(error)
        if (error.message === 'Invalid message') socket.terminate()
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
