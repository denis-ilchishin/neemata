'use strict'

const { fastify: createFastify } = require('fastify')
const { parse: querystringParser } = require('qs')

const createHttpTransport = require('./transports/http')
const createWsTranport = require('./transports/ws')
const { ApiException } = require('./exceptions')
const { ErrorCode } = require('@neemata/common')

const transports = [createHttpTransport, createWsTranport]

class Server {
  /**
   * @type {Set<import('./client').Client>}
   */
  clients = new Set()
  /**
   * @type {import('./application').WorkerApplication}
   */
  application

  /**
   * @param {number} port
   * @param {import('./application').WorkerApplication} application
   */
  constructor(port, application) {
    this.application = application
    this.port = port

    // TODO: add fastify options to config?
    this.fastify = createFastify({
      querystringParser,
      trustProxy: true,
      caseSensitive: true,
      return503OnClosing: true,
    })

    this.fastify.register(
      require('@fastify/cors'),
      this.application.config.api.cors
    )
    this.fastify.register(
      require('@fastify/multipart'),
      this.application.config.api.multipart
    )
    this.fastify.register(require('@fastify/websocket'))

    for (const factory of transports) {
      factory(this)
    }

    this.fastify.get(
      this.application.config.api.baseUrl + '/neemata/healthy',
      () => 'OK'
    )

    this.fastify.get(
      this.application.config.api.baseUrl + '/neemata/introspect',
      async (req) => {
        try {
          const auth = await this.handleAuth(req.headers.authorization)

          const introspected = []

          await Promise.all(
            Array.from(this.application.modules.api.modules.values()).map(
              async ({ name, transport, introspectable, version }) => {
                if (
                  (typeof introspectable === 'function' &&
                    (await introspectable({ req, auth }))) ||
                  (typeof introspectable !== 'function' && introspectable)
                )
                  introspected.push({ name, version, transport })
              }
            )
          )

          return introspected
        } catch (error) {
          console.error(error)
          throw error
        }
      }
    )
  }

  get authService() {
    return (
      this.application.modules.services.get(
        this.application.config.auth.service
      ) ?? (() => null)
    )
  }

  makeResponse({ error = null, data = null }) {
    return { error, data }
  }

  makeError({ code, message = 'Server error', data = null }) {
    return this.makeResponse({ error: { code, message }, data })
  }

  async handleAuth(rawAuth) {
    return this.authService(rawAuth)
  }

  async handleGuards(guards, params) {
    return Promise.all(
      Array.from(new Set(guards)).map(async (guard) => {
        const hasAccess = await guard(params)
        if (!hasAccess)
          throw new ApiException({
            code: ErrorCode.Forbidden,
            message: 'Forbidden',
          })
      })
    )
  }

  async handleApi(handler, timeout, params) {
    return Promise.race([
      handler(params),
      new Promise((_, reject) =>
        setTimeout(
          () =>
            reject(
              new ApiException({
                code: ErrorCode.GatewayTimeout,
                message: 'Request timeout',
              })
            ),
          timeout || this.application.config.timeouts.request
        )
      ),
    ])
  }

  /**
   *
   * @param {import('zod').Schema} schema
   * @param {*} data

   */
  async handleSchema(schema, data) {
    const result = await schema.safeParseAsync(data)

    if (result.success) {
      return result.data
    } else {
      throw new ApiException({
        code: ErrorCode.ValidationError,
        message: 'Request body validation error',
        data: result.error.format(),
      })
    }
  }

  listen() {
    return this.fastify.listen({
      host: this.application.config.api.hostname,
      port: this.port,
    })
  }

  close() {
    return this.fastify.close()
  }
}

module.exports = { Server }
