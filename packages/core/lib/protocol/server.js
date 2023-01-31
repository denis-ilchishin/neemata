'use strict'

const { createServer } = require('node:http')
const { WebSocketServer } = require('ws')
const { HttpTransport } = require('./http')
const { WsTransport } = require('./ws')
const { parse, serialize } = require('cookie')
const { createHash, randomBytes } = require('node:crypto')
const { Semaphore } = require('../utils/semaphore')

const AUTH_DEFAULT = () => null
const SESSION_COOKIE = '__NSID'

class Server {
  constructor(port, application) {
    this.application = application
    this.port = port

    this.clients = new Map()
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
    const { modules, config } = this.application
    return modules.services.get(config.auth.service) ?? AUTH_DEFAULT
  }

  async handleAuth(...args) {
    return this.authService(...args)
  }

  async introspect(req, auth) {
    const introspected = []

    const modules = Array.from(this.application.modules.api.modules.values())
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
      Array.from(guards).map(async (guard) => {
        return guard({ req, auth })
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

  getSession(req) {
    return parse(req.headers.cookie || '')[SESSION_COOKIE]
  }

  createSession() {
    const data = Buffer.concat([
      randomBytes(64),
      Buffer.from(Date.now().toString()),
    ])
    const token = createHash('sha1').update(data).digest('base64url')
    const cookie = serialize(SESSION_COOKIE, token, {
      secure: true,
      path: '/',
    })
    return { token, cookie }
  }

  listen() {
    return new Promise((r) =>
      this.httpServer.listen(
        this.port,
        this.application.config.api.hostname,
        undefined,
        () => r(JSON.stringify(this.httpServer.address()))
      )
    )
  }

  close() {
    return new Promise((r) => this.httpServer.close(r))
  }
}

module.exports = { Server }
