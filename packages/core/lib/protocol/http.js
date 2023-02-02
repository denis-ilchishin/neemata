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
}

class HttpTransport extends BaseTransport {
  constructor(server) {
    super(server)
    this.cors = server.application.config.api.cors
    this.server.httpServer.on('request', this.receiver.bind(this))
    this.type = Transport.Http
  }

  getData(req) {
    return new Promise((resolve, reject) => {
      const chunks = []
      req.on('data', (chunk) => chunks.push(chunk))
      req.on('error', (err) => reject(err))
      req.on('end', () => resolve(Buffer.concat(chunks)))
    })
  }

  setHeaders(res, extra = {}) {
    for (const [k, v] of Object.entries({ ...HEADERS, ...extra })) {
      res.setHeader(k, v)
    }
  }

  createRespond(req, res) {
    res.statusCode = 200
    this.setHeaders(res, {
      'Access-Control-Allow-Origin':
        this.cors.origin === '*' ? req.headers.origin : this.cors.origin,
    })

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
    try {
      const response = await routeHandler.call(this, {
        req,
        res,
        url,
      })
      return ['string', 'undefined'].includes(typeof response)
        ? respondPlain(response)
        : respond(response)
    } catch (error) {
      console.error(error)
      return respondPlain(error.message, 400)
    }
  }

  async rpc({ req, res, url }) {
    try {
      const session = this.server.handleSession(req)
      if (session.cookie) res.setHeader('Set-Cookie', session.cookie)
      const auth = this.server.handleAuth({ session: session.token, req })
      const version = this.handleVersion(req.headers['accept-version'])
      const procedureName = url.pathname.split('/').slice(1).join('.')
      const procedure = this.findProcedure(
        procedureName,
        Transport.Http,
        version
      )
      const rawData = await this.getData(req)
      const data = this.deserialize(rawData.toString('utf8'))
      const client = createClient({
        auth: await auth,
        session: session.token,
      })
      const result = await this.handle({ procedure, client, data, req })
      return this.makeResponse({ data: result })
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

  async ['GET.neemata/introspect']({ req }) {
    const auth = this.server.handleAuth(req)
    return this.server.introspect(req, await auth)
  }

  ['GET.neemata/healthy']() {
    return 'OK'
  }

  ['POST.neemata/stream']({ req, url }) {
    return new Promise((resolve, reject) => {
      const streamId = url.query.id
      const stream = this.server.streams.get(streamId)
      const session = this.server.getSession(req)
      if (!stream || stream.client.session !== session)
        new Error('Stream not found')

      req.on('end', resolve)
      req.on('error', () => reject('Stream error'))
      req.pipe(stream)
    })
  }
}

module.exports = { HttpTransport }
