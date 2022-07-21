const fastifyWs = require('@fastify/websocket')
const Joi = require('joi')
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

    this.fastify.get(
      this.application.appConfig.api.baseUrl,
      { websocket: true },
      (conn, req) => {
        this.application.console.debug(
          'WebSocket connection handshake',
          'Channel'
        )
        conn.setEncoding('utf-8')

        //
        ;(async () => {
          const auth = await this.handleAuth(this.resolveAuth(req))

          if (auth) {
            await this.application.executeHook('connection', {
              req,
              auth,
              client: conn.socket,
            })
          }

          const reload = () =>
            this.send(conn.socket, {
              type: 'server',
              payload: {
                event: 'neemata:reload',
              }
            })

          this.application.on('reload', reload)

          conn.socket.on('close', () => {
            this.application.console.debug(
              'WebSocket connection closed',
              'Channel'
            )
            this.application.off('reload', reload)

            if (auth) {
              this.application.executeHook('disconnection', {
                auth,
                client: conn.socket,
                req,
              })
            }
          })

          conn.socket.on('message', (message) =>
            this.handleMessage({ auth, message, req, conn }).catch((err) =>
              this.application.console.exception(err)
            )
          )
        })().catch((err) => this.application.console.exception(err))
      }
    )
  }

  bindSandbox() {
    this.application.sandbox.application.wss = {
      server: (event, data) => {
        this.redis.emit(SubscriberEventType.ServerMessage, {
          type: 'server',
          payload: { event, data },
        })
      },
      client: (client, event, data) => {
        this.send(client, {
          type: 'server',
          payload: { event, data },
        })
      },
    }
  }

  async handleMessage({ conn, message, auth, req }) {
    message = await this.parseMessage(message)

    if (message.type === 'room') {
      const { event, room } = message.payload
      this.rooms[event](event, room)
      this.send(conn.socket, {
        type: 'room',
        payload: { event: 'join', room },
      })
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

        const result = await this.handleApi(apiModule.handler, {
          data,
          auth,
          client: conn.socket,
          req,
        })

        this.send(conn.socket, {
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

        this.send(conn.socket, {
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
    return Joi.object({
      type: Joi.string().allow('room', 'api').required(),
      payload: Joi.when('type', {
        is: 'room',
        then: Joi.object({
          event: Joi.string().allow('join', 'leave').required(),
          room: Joi.string().required(),
        }).required(),
        otherwise: Joi.object({
          messageId: Joi.string().uuid().required(),
          module: Joi.string().required(),
          version: Joi.string().default('*'),
          data: Joi.any(),
        }).required(),
      }),
    })
      .required()
      .validateAsync(JSON.parse(rawMessage))
  }

  serialize(message) {
    return JSON.stringify(message)
  }
}

module.exports = { WsChannel }
