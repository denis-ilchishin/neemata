'use strict'

const { createServer } = require('node:http')
const { WebSocketServer } = require('ws')
const { HttpTransport } = require('./http')
const { WsTransport } = require('./ws')
const { Semaphore } = require('../utils/semaphore')
const { unique } = require('../utils/functions')
const { setTimeout } = require('node:timers/promises')

const AUTH_DEFAULT = () => null

class Server {
  constructor(port, application) {
    this.application = application
    this.port = port

    this.wsClients = new Map()
    this.streams = new Map()

    this.httpServer = createServer()
    this.wsServer = new WebSocketServer({ noServer: true })

    this.httpTransport = new HttpTransport(this)
    this.wsTransport = new WsTransport(this)

    const { concurrency, size } = this.application.config.api.queue
    const { queue: timeout } = this.application.config.timeouts.rpc
    this.queue = new Semaphore(concurrency, size, timeout)
  }

  get authService() {
    const { namespaces, config } = this.application
    return namespaces.services.get(config.api.auth.service) ?? AUTH_DEFAULT
  }

  async handleAuth({ req }) {
    return this.authService({ req })
  }

  async introspect(req, client) {
    const introspected = []

    const modules = Array.from(this.application.namespaces.api.modules.values())
    const hasGuardsIntrospectable = modules.some(
      ({ introspectable }) => introspectable === 'guards'
    )
    const guards = modules
      .filter(({ introspectable }) => typeof introspectable === 'function')
      .map(({ introspectable }) => introspectable)

    let passedGuards = []

    if (hasGuardsIntrospectable) {
      guards.push(
        ...modules
          .map(({ guards }) => guards)
          .reduce((a, b) => [...a, ...b], [])
      )
    }

    const settledGuards = await Promise.allSettled(
      unique(guards).map(async (guard) => {
        if (await guard({ req, client })) return guard
      })
    )

    passedGuards = settledGuards
      .filter(({ status }) => status === 'fulfilled')
      .map(({ value }) => value)

    await Promise.allSettled(
      modules.map(
        async ({ name, transport, introspectable, version, guards }) => {
          const add = () => introspected.push({ name, version, transport })

          if (introspectable === true) add()
          else if (introspectable === 'guards') {
            if (!guards.find((guard) => !passedGuards.includes(guard))) add()
          } else if (typeof introspectable === 'function') {
            if (passedGuards.includes(introspectable)) add()
          }
        }
      )
    )

    return introspected
  }

  listen() {
    return new Promise((r) =>
      this.httpServer.listen(
        this.port,
        this.application.config.api.hostname,
        undefined,
        () => r(this.getAddress())
      )
    )
  }

  getAddress() {
    const address = this.httpServer.address()
    if (!address) return null
    if (typeof address === 'string') return address
    const { address: hostname, port, family } = address
    return `${family === 'IPv6' ? '[' : ''}${hostname}${family === 'IPv6' ? ']' : ''
      }:${port}`
  }

  async close() {
    logger.debug('Shutting http server...')
    this.httpServer.close()
    this.wsClients.forEach((client) => client.close())
    while (this.wsClients.size > 0) await setTimeout(50)
  }
}

module.exports = { Server }
