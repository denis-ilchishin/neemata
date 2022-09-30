const { fastify: createFastify } = require('fastify')
const fastifyCors = require('@fastify/cors')
const { isMainThread } = require('node:worker_threads')
const { HttpStatus } = require('../enums/http-status')

const { WsTransport } = require('./transports/ws')
const { HttpTransport } = require('./transports/http')
const { Protocol } = require('../enums/protocol')

const transports = {
  [Protocol.Ws]: WsTransport,
  [Protocol.Http]: HttpTransport,
}

class Server {
  constructor({ port }, application) {
    if (isMainThread) throw new Error('Main thread reserved for internal use')

    this.application = application
    this.fastify = null
    this.port = port
    this.cors = application.appConfig.server.cors
    this.hostname = application.appConfig.server.hostname
    this.transports = {}

    this.createFastify()
  }

  createFastify() {
    const fastify = createFastify()

    fastify.register(fastifyCors, { origin: this.cors ?? '*' })

    fastify.addHook('onRequest', (req, res, done) => {
      this.application.console.info(
        `Request: [${req.method}] ${req.url}`,
        'Server'
      )
      if (!req.url.startsWith(this.application.appConfig.api.baseUrl)) {
        res.code(HttpStatus.FORBIDDEN).send()
      } else {
        done()
      }
    })

    fastify.get(
      this.application.appConfig.api.baseUrl + '/neemata/health',
      () => 'OK'
    )

    fastify.get(
      this.application.appConfig.api.baseUrl + '/neemata/introspect',
      async (req) => {
        try {
          const httpTransport = this.transports[Protocol.Http]
          const auth = await httpTransport.handleAuth(
            httpTransport.resolveAuth(req)
          )

          const introspected = []

          await Promise.all(
            Array.from(this.application.api.modules.values()).map(
              async ({ name, protocol, introspectable, version }) => {
                if (
                  (typeof introspectable === 'function' &&
                    (await introspectable({ req, auth }))) ||
                  (typeof introspectable !== 'function' && introspectable)
                )
                  introspected.push({ name, version, protocol })
              }
            )
          )

          return introspected
        } catch (error) {
          console.error(error)
        }
      }
    )

    for (const [key, transport] of Object.entries(transports)) {
      this.transports[key] = new transport(fastify, this.application)
      this.transports[key].bind()
    }

    this.fastify = fastify
  }

  async listen() {
    const address = await this.fastify.listen({
      port: this.port,
      host: this.hostname,
    })
    this.application.console.info(`Listening on: ${address}`, 'Server')
  }

  close() {
    return this.fastify.close()
  }
}

module.exports = {
  Server,
}
