const { fastify: createFastify } = require('fastify')
const fastifyCors = require('@fastify/cors')
const { isMainThread } = require('worker_threads')
const { HttpStatus } = require('../enums/http-status')
const { timeout } = require('../utils/helpers')
const { WsChannel } = require('./channels/ws')
const { HttpChannel } = require('./channels/http')

const channels = [WsChannel, HttpChannel]

class Server {
  constructor({ port }, application) {
    if (isMainThread) throw new Error('Main thread reserved for internal use')

    this.application = application
    this.fastify = null
    this.port = port
    this.cors = application.appConfig.server.cors
    this.hostname = application.appConfig.server.hostname

    this.createFastify()
  }

  createFastify() {
    const fastify = createFastify()

    fastify.register(fastifyCors, { origin: this.cors ?? '*' })

    fastify.addHook('onRequest', (req, res, done) => {
      this.application.console.info(
        `Request: [${req.method}] ${req.url.slice(
          0,
          req.url.indexOf('?') ?? undefined
        )}`,
        'Server'
      )
      if (!req.url.startsWith(this.application.appConfig.api.baseUrl)) {
        res.code(HttpStatus.FORBIDDEN).send()
      } else {
        done()
      }
    })

    fastify.addHook('onRoute', ({ url, method, websocket }) => {
      this.application.console.debug(
        `Registred new route: [${method}]${
          websocket ? ' WebSocket' : ''
        } ${url}`,
        'Server'
      )
    })

    fastify.get(
      this.application.appConfig.api.baseUrl + '/introspect',
      (req, res) => {
        res.code(200).send(this.application.api.introspected)
      }
    )

    this.fastify = fastify

    for (const channel of channels) {
      new channel(fastify, this.application).bind()
    }
  }

  async listen() {
    await timeout(
      this.fastify.listen(this.port, this.hostname),
      this.application.appConfig.timeouts.server.startup,
      new Error('Unable to start the server in specified timeframe')
    )

    this.application.console.info(`Listening on port: ${this.port}`, 'Server')
  }

  async close() {
    await timeout(
      this.fastify.close(),
      this.application.appConfig.timeouts.server.shutdown,
      null
    )
  }
}

module.exports = {
  Server,
}
