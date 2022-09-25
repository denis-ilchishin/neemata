const fastifyWs = require('@fastify/websocket')
const Joi = require('joi')
const { parentPort } = require('worker_threads')
const { ErrorCode } = require('../../enums/error-code')
const { Protocol } = require('../../enums/protocol')
const { SubscriberEventType } = require('../../enums/subscriber-event')
const { Channel } = require('../channel')
const { ApiException } = require('../exception')

class WsChannel extends Channel {
  constructor(fastify, application) {
    super(fastify, application)

    if (!this.application.redis) {
      throw new Error('WebSocket channel requires `redis` connection')
    }

    this.redis = this.application.redis

    this.fastify.register(fastifyWs)
  }

  resolveAuth(req) {
    const [type, token] = (req.query.authorization ?? '').split(' ')
    if (type === 'Token' && token) return token
    else return null
  }

  bind() {
    this.redis.on(SubscriberEventType.ServerMessage, (message) => {
      for (const socket of this.fastify.websocketServer.clients) {
        this.send(socket, message)
      }
    })

    this.bindSandbox()

    this.application.on('reload', () => this.bindSandbox())

    this.fastify.register(async (fastify) => {
      fastify.get(
        this.application.appConfig.api.baseUrl,
        { websocket: true },
        (connection, req) => {
          this.application.console.debug(
            'WebSocket connection handshake',
            'Channel'
          )
          connection.setEncoding('utf-8')
          const client = connection.socket

          const _auth = this.handleAuth(this.resolveAuth(req))

          const handle = async () => {
            const auth = await _auth
            client.auth = auth

            await this.application.executeHook('connection', {
              req,
              auth,
              client,
            })

            client.on('close', () => {
              this.application.console.debug(
                'WebSocket connection closed',
                'Channel'
              )
              this.application.executeHook('disconnection', {
                auth,
                client: client,
                req,
              })
            })

            client.on('message', (message) =>
              this.handleMessage({
                auth,
                message,
                req,
                client,
              }).catch((err) => this.application.console.exception(err))
            )
          }

          handle().catch((err) => this.application.console.exception(err))
        }
      )
    })
  }

  bindSandbox() {
    this.application.sandbox.application.wss = {
      emit: (event, data, client) => {
        if (client) {
          this.send(client, {
            type: 'server',
            payload: { event, data },
          })
        } else {
          this.redis.emit(SubscriberEventType.ServerMessage, {
            type: 'server',
            payload: { event, data },
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
    return Joi.alternatives(
      Joi.object({
        type: Joi.string().allow('api').required(),
        payload: Joi.object({
          messageId: Joi.string().uuid().required(),
          module: Joi.string().required(),
          version: Joi.string(),
          data: Joi.any(),
        }).required(),
      }),
      Joi.object({
        type: Joi.string().allow('server').required(),
        payload: Joi.object({ event: Joi.string().required() }).required(),
      })
    )
      .required()
      .validateAsync(JSON.parse(rawMessage))
  }

  serialize(message) {
    return JSON.stringify(message)
  }
}

module.exports = { WsChannel }
