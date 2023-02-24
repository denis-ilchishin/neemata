'use strict'

const { ErrorCode, Transport } = require('@neemata/common')
const { ApiException } = require('./exceptions')
const { BaseTransport } = require('./transport')
const { parse } = require('node:url')
const { createClient } = require('./client')

const JSON_CONTENT_TYPE_HEADER = [
  'Content-Type',
  'application/json; charset=utf-8',
]
const PLAIN_CONTENT_TYPE_HEADER = ['Content-Type', 'text/plain; charset=utf-8']

const HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Credentials': 'true',
}

class HttpTransport extends BaseTransport {
  constructor(server) {
    super(server)
    this.cors = server.application.config.api.cors
    this.server.httpServer.on('request', this.receiver.bind(this))
    this.type = Transport.Http
  }

  async getData(req) {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    return Buffer.concat(chunks)
  }

  setHeaders(res, extra = {}) {
    for (const [k, v] of Object.entries({ ...HEADERS, ...extra })) {
      res.setHeader(k, v)
    }
  }

  createRespond(req, res) {
    res.statusCode = 200
    this.setHeaders(
      res,
      req.headers.origin && {
        'Access-Control-Allow-Origin':
          this.cors.origin === '*' ? req.headers.origin : this.cors.origin,
      }
    )

    const respond = (data) => {
      res.setHeader(...JSON_CONTENT_TYPE_HEADER)
      res.end(this.serialize(data))
    }

    const respondPlain = (data, status) => {
      if (status) res.statusCode = status
      res.setHeader(...PLAIN_CONTENT_TYPE_HEADER)
      res.end(data)
    }

    const respondPlain404 = () => {
      respondPlain('Not found', 404)
    }

    return { respond, respondPlain, respondPlain404 }
  }

  async receiver(req, res) {
    const { respond, respondPlain, respondPlain404 } = this.createRespond(
      req,
      res
    )
    const { method } = req
    if (method === 'OPTIONS') return res.end()
    const url = parse(req.url, true)
    const routeName = `${method}.${url.pathname.slice(1)}`
    if (method !== 'POST' && !this[routeName]) return respondPlain404()
    const routeHandler = this[routeName] ?? this.rpc
    const session = this.server.handleSession(req)
    if (session.cookie) res.setHeader('Set-Cookie', session.cookie)
    try {
      const payload = { req, res, url, session }
      const response = await routeHandler.call(this, payload)
      return ['string', 'undefined'].includes(typeof response)
        ? respondPlain(response)
        : respond(response)
    } catch (error) {
      console.error(error)
      return respondPlain(error.message, 400)
    }
  }

  async rpc({ req, url, session, res }) {
    try {
      const auth = this.server.handleAuth({ session: session.token, req })
      const version = this.handleVersion(req.headers['accept-version'])
      const procedureName = url.pathname.split('/').slice(1).join('.')
      const procedure = this.findProcedure(
        procedureName,
        Transport.Http,
        version
      )
      const rawData = await this.getData(req)
      const data = rawData.length
        ? this.deserialize(rawData.toString('utf8'))
        : undefined
      const client = createClient({
        auth: await auth,
        session: session.token,
        clearSession: () => this.server.clearSession(res),
      })
      return this.handle({ procedure, client, data, req })
    } catch (error) {
      if (error instanceof ApiException) return this.makeError(error)
      else {
        console.error(error)
        return this.makeError({
          code: ErrorCode.InternalError,
        })
      }
    }
  }

  async ['GET.neemata/introspect']({ req, session }) {
    const auth = this.server.handleAuth({ req, session })
    const client = createClient({
      auth: await auth,
      session: session.token,
    })
    return this.server.introspect(req, client)
  }

  ['GET.neemata/session/clear']({ res }) {
    return this.server.clearSession(res)
  }

  ['GET.neemata/healthy']() {
    return 'OK'
  }

  ['POST.neemata/stream']({ req, url, session }) {
    return new Promise((resolve, reject) => {
      const streamId = url.query.id
      const stream = this.server.streams.get(streamId)
      if (!stream || stream.client.session !== session)
        new Error('Stream not found')

      req.on('end', resolve)
      req.on('error', () => reject('Stream error'))
      req.pipe(stream)
    })
  }
}

module.exports = { HttpTransport }
