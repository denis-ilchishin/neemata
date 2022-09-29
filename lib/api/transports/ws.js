const fastifyWs = require('@fastify/websocket')

const { parentPort } = require('worker_threads')
const { ErrorCode } = require('../../enums/error-code')
const { Protocol } = require('../../enums/protocol')
const { WorkerEvent } = require('../../enums/worker-event')
const { Transport } = require('../transport')
const { ApiException } = require('../exception')
const { randomUUID } = require('crypto')
const { z: Zod } = require('zod')

class WsTransport extends Transport {
  constructor(fastify, application) {
    super(fastify, application)
    this.fastify.register(fastifyWs)
  }

  resolveAuth(req) {
    const [type, token] = (req.query.authorization ?? '').split(' ')
    if (type === 'Token' && token) return token
    else return null
  }

  bind() {
    this.application.on(
      `neemata:${WorkerEvent.ServerPropagateMessage}`,
      (message) => {
        for (const socket of this.fastify.websocketServer.clients) {
          this.send(socket, message)
        }
      }
    )

    this.bindWssToSandbox()
    this.application.on('reload', () => this.bindWssToSandbox())

    this.fastify.register(async (fastify) => {
      fastify.get(
        this.application.appConfig.api.baseUrl,
        { websocket: true },
        (connection, req) => {
          this.application.console.debug(
            'WebSocket connection handshake',
            'Transport'
          )
          connection.setEncoding('utf-8')

          const client = connection.socket
          client.id = randomUUID()

          let ready = null
          let auth = null

          const onReload = () =>
            this.send(client, {
              type: 'server',
              payload: { event: 'neemata:reload' },
            })

          client.on('close', async () => {
            await ready

            this.application.off('reload', onReload)
            this.application.console.debug(
              'WebSocket connection closed',
              'Transport'
            )
            await this.application.executeHook('disconnection', {
              auth,
              client: client,
              req,
            })
          })

          client.on('message', async (message) => {
            try {
              await ready
              await this.handleMessage({
                auth,
                message,
                req,
                client,
              })
            } catch (err) {
              this.application.console.exception(err)
            }
          })

          this.application.on('reload', onReload)

          const prepare = async () => {
            const auth = (client.auth = await this.handleAuth(
              this.resolveAuth(req)
            ))

            await this.application.executeHook('connection', {
              req,
              auth,
              client,
            })
          }

          ready = prepare().catch((err) => {
            this.application.console.exception(err)
            client.close()
          })
        }
      )
    })
  }

  bindWssToSandbox() {
    this.application.sandbox.application.wss = {
      emit: (event, data, client) => {
        if (client) {
          this.send(client, {
            type: 'server',
            payload: { event, data },
          })
        } else {
          parentPort.postMessage({
            event: WorkerEvent.ServerPropagateMessage,
            message: {
              type: 'server',
              payload: { event, data },
            },
          })
        }
      },
    }

    const fastify = this.fastify

    Object.defineProperty(this.application.sandbox.application.wss, 'clients', {
      get() {
        return fastify.websocketServer.clients
      },
    })
  }

  async handleMessage({ client, message, auth, req }) {
    message = await this.parseMessage(message)

    if (typeof message === 'undefined') return

    if (message.type === 'server') {
      switch (message.payload.event) {
        case 'neemata:ping':
          this.send(client, {
            type: 'server',
            payload: { event: 'neemata:pong' },
          })
          break
      }
    } else {
      const { messageId, module, version } = message.payload
      let data = message.payload.data
      try {
        const apiModule = this.application.api.get(module, Protocol.Ws, version)

        if (!apiModule) {
          throw new ApiException({
            code: ErrorCode.NotFound,
            message: 'Not found',
          })
        }

        if (apiModule.auth && !auth) {
          throw new ApiException({
            code: ErrorCode.Unauthorized,
            message: 'Unauthorized request',
          })
        }

        if (apiModule.guards) {
          await this.handleGuards(apiModule.guards, { auth, req })
        }

        if (apiModule.schema) {
          data = await this.handleSchema(apiModule.schema, data)
        }

        const result = await this.handleApi(
          apiModule.handler,
          apiModule.timeout,
          {
            data,
            auth,
            client: client,
            req,
          }
        )

        this.send(client, {
          type: 'api',
          payload: {
            messageId,
            module,
            ...this.makeResponse({ data: result }),
          },
        })
      } catch (err) {
        let payload

        if (err instanceof ApiException) {
          payload = this.makeError({
            code: err.code,
            message: err.message,
            data: err.data,
          })
        } else {
          this.application.console.exception(err)
          payload = this.makeError({
            code: ErrorCode.InternalServerError,
            message: 'Internal server error',
          })
        }

        this.send(client, {
          type: 'api',
          payload: {
            messageId,
            module,
            ...payload,
          },
        })
      }
    }
  }

  send(socket, message) {
    if (socket.readyState === socket.OPEN) {
      socket.send(this.serialize(message))
    }
  }

  async parseMessage(rawMessage) {
    const parsed = await Zod.discriminatedUnion('type', [
      Zod.object({
        type: Zod.literal('api'),
        payload: Zod.object({
          messageId: Zod.string().uuid(),
          module: Zod.string(),
          version: Zod.string().default('*').optional(),
          data: Zod.any().optional(),
        }),
      }),
      Zod.object({
        type: Zod.literal('server'),
        payload: Zod.object({
          event: Zod.string(),
        }),
      }),
    ]).safeParseAsync(JSON.parse(rawMessage))

    if (parsed.success) return parsed.data
  }

  serialize(message) {
    return JSON.stringify(message)
  }
}

module.exports = { WsTransport }
