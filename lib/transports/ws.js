const { Transport, ErrorCode } = require('../enums')
const { createClient } = require('../client')
const { ApiException } = require('../exceptions')
const Zod = require('zod')

/**
 *
 * @param {import('../server').Server} server
 */
module.exports = function (server) {
  const { fastify, application } = server

  function send(socket, message) {
    socket.send(JSON.stringify(message))
  }

  function sendToSocket(socket, { event, data }) {
    const message = {
      type: 'message',
      payload: {
        event,
        data,
      },
    }

    if (socket.readyState === socket.CONNECTING)
      socket.once('open', () => send(socket, message))
    else if (socket.readyState === socket.OPEN) send(socket, message)
    else throw new Error('Socket is already closed')
  }

  const schema = Zod.discriminatedUnion('type', [
    Zod.object({
      type: Zod.literal('api'),
      payload: Zod.object({
        correlationId: Zod.string().uuid(),
        module: Zod.string(),
        version: Zod.string().default('*'),
        data: Zod.any().optional(),
      }),
    }),
    Zod.object({
      type: Zod.literal('message'),
      payload: Zod.object({
        event: Zod.string(),
        data: Zod.any(),
      }),
    }),
  ])

  /**
   * @typedef {{socket: import('ws').WebSocket, client: import('../client').Client, req: import('fastify').FastifyRequest}} HandlerPayload
   */

  /**
   * @param {HandlerPayload} options
   * @param {(import('zod').TypeOf<typeof schema> extends infer U ? (U extends {type: "message"} ? U : never) : never)['payload']} payload
   */
  async function messageHandler({ client }, payload) {
    client.emit(payload.event, payload.data)
  }

  /**
   * @param {HandlerPayload} options
   * @param {(import('zod').TypeOf<typeof schema> extends infer U ? (U extends {type: "api"} ? U : never) : never)['payload']} payload
   */
  async function apiHandler({ client, socket, req }, payload) {
    try {
      const auth = client.auth

      const module = application.modules.api.get(
        payload.module,
        Transport.Ws,
        payload.version
      )

      if (!module)
        throw new ApiException({
          code: ErrorCode.NotFound,
          message: 'Not found',
        })

      if (module.auth !== false && !auth) {
        throw new ApiException({
          code: ErrorCode.Unauthorized,
          message: 'Unauthorized',
        })
      }

      if (module.guards) {
        await server.handleGuards(module.guards, { auth, req })
      }

      let data

      if (module.schema) {
        data = await server.handleSchema(module.schema, payload.data)
      }

      application.runHooks('request', true, {
        client,
        auth,
        data,
        req,
        module: { name: module.name, version: module.version },
      })

      const result = await server.handleApi(module.handler, module.timeout, {
        client,
        data,
        auth,
        req,
      })

      send(socket, {
        type: 'api',
        payload: {
          correlationId: payload.correlationId,
          module: payload.module,
          data: result,
        },
      })
    } catch (err) {
      let response

      if (err instanceof ApiException) {
        response = server.makeError({
          code: err.code,
          message: err.message,
          data: err.data,
        })
      } else {
        application.console.error(err, 'WS')
        response = server.makeError({
          code: ErrorCode.InternalServerError,
          message: 'Internal server error',
        })
      }

      send(socket, {
        type: 'api',
        payload: {
          correlationId: payload.correlationId,
          module: payload.module,
          ...response,
        },
      })
    }
  }

  function bindReload(client, socket) {
    const handler = () => sendToSocket(socket, { event: 'neemata:reload' })
    application.on('reloaded', handler)
    socket.once('close', () => application.off('reloaded', handler))
  }

  function bindPingPong(client, socket) {
    const pingPongInterval = setInterval(() => {
      Promise.race([
        new Promise((r) => client.once('neemata:pong', r)),
        new Promise((_, r) =>
          setTimeout(r, application.config.intervals.ping / 2)
        ),
      ]).catch(() => socket.close())
      sendToSocket(socket, { event: 'neemata:ping' })
    }, application.config.intervals.ping)

    socket.once('close', () => clearInterval(pingPongInterval))
  }

  const handlers = {
    message: messageHandler,
    api: apiHandler,
  }

  fastify.register(async function (fastify) {
    fastify.get(
      application.config.api.baseUrl,
      { websocket: true },
      (connection, req) => {
        try {
          connection.setEncoding('utf-8')

          // creating Client instance from socket
          const { socket } = connection
          const client = createClient(socket, sendToSocket)
          server.clients.add(client)

          const authPromise = server
            .handleAuth(req.query.authorization)
            .then((auth) => {
              client.auth = auth || null
              return application.runHooks('connect', false, { client, req })
            })

          bindReload(client, socket)
          if (application.config.intervals.ping) bindPingPong(client, socket)

          socket.once('close', async () => {
            await application.runHooks('disconnect', false, { client, req })
            server.clients.delete(client)
          })

          socket.on('message', async (raw) => {
            try {
              const message = await schema.safeParseAsync(
                JSON.parse(raw.toString('utf-8'))
              )
              await authPromise

              if (message.success) {
                const { type, payload } = message.data
                await handlers[type]({ client, socket, req }, payload)
              } else throw message.error
            } catch (err) {
              application.console.error(err, 'WS')
            }
          })
        } catch (err) {
          application.console.error(err, 'WS')
        }
      }
    )
  })
}
