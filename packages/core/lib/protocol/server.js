'use strict'

const { createServer } = require('node:http')
const { WebSocketServer } = require('ws')
const { HttpTransport } = require('./http')
const { WsTransport } = require('./ws')
const { parse, serialize } = require('cookie')
const { createHash, randomBytes } = require('node:crypto')
const { Semaphore } = require('../utils/semaphore')
const { unique } = require('../utils/functions')

const AUTH_DEFAULT = () => null
const SESSION_COOKIE = '__NSID'
const SESSION_DELETED_VALUE = '__DELETED'

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
    return modules.services.get(config.api.auth.service) ?? AUTH_DEFAULT
  }

  async handleAuth({ session, req }) {
    return this.authService({ session, req })
  }

  async introspect(req, client) {
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

  handleSession(req) {
    let token = this.getSessionToken(req)
    let cookie

    if (!token || token === SESSION_DELETED_VALUE) {
      token = this.createSessionToken(req)
      cookie = this.getSessionCookie(token)
    }

    return { token, cookie }
  }

  clearSession(res) {
    res.setHeader('Set-Cookie', SESSION_DELETED_VALUE)
  }

  getSessionToken(req) {
    return parse(req.headers.cookie || '')[SESSION_COOKIE]
  }

  createSessionToken() {
    const data = Buffer.concat([
      randomBytes(64),
      Buffer.from(Date.now().toString()),
    ])
    const token = createHash('sha512').update(data).digest('base64url')
    return token
  }

  getSessionCookie(token) {
    // TODO: configurable cookie options?
    const expires = new Date()
    expires.setFullYear(expires.getFullYear() + 1)
    return serialize(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: !this.application.isDev,
      path: '/',
      expires,
    })
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
    return `${family === 'IPv6' ? '[' : ''}${hostname}${
      family === 'IPv6' ? ']' : ''
    }:${port}`
  }

  close() {
    return new Promise((r) => this.httpServer.close(r))
  }
}

module.exports = { Server, SESSION_DELETED_VALUE }
