const { fastify: createFastify } = require('fastify')
const fastifyCors = require('@fastify/cors')
const { isMainThread } = require('node:worker_threads')
const { HttpStatus } = require('../enums/http-status')

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
        `Request: [${req.method}] ${req.url}`,
        'Server'
      )
      if (!req.url.startsWith(this.application.appConfig.api.baseUrl)) {
        res.code(HttpStatus.FORBIDDEN).send()
      } else {
        done()
      }
    })

    fastify.get(this.application.appConfig.api.baseUrl + '/health', () => 'OK')

    this.fastify = fastify

    for (const channel of channels) {
      new channel(fastify, this.application).bind()
    }
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
