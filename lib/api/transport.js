const { isAsyncFunction } = require('util/types')
const { ErrorCode } = require('../enums/error-code')
const { timeout } = require('../utils/helpers')
const { ApiException } = require('./exception')

class Transport {
  constructor(fastify, application) {
    this.fastify = fastify
    this.application = application

    if (!isAsyncFunction(this.authHandler)) {
      throw new Error(
        'Auth lib specified in `config:auth.lib` must export async function',
        'Server'
      )
    }
  }

  get authHandler() {
    return this.application.lib.get(this.application.appConfig.auth.lib)
  }

  makeResponse({ error = null, data = null }) {
    return { error, data }
  }

  makeError({ code, message = 'Server error', data = null }) {
    return this.makeResponse({ error: { code, message }, data })
  }

  async handleAuth(auth) {
    return this.authHandler(auth)
  }

  async handleGuards(guards, arg) {
    for (const guard of new Set(guards)) {
      const hasAccess = await guard(arg)
      if (!hasAccess)
        throw new ApiException({
          code: ErrorCode.Forbidden,
          message: 'Forbidden',
        })
    }
  }

  async handleApi(hander, handerTimeout, arg) {
    return timeout(
      hander(arg),
      handerTimeout || this.application.appConfig.timeouts.request,
      new ApiException({
        code: ErrorCode.GatewayTimeout,
        message: 'Request timeout',
      })
    )
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
        data: result.error,
      })
    }
  }

  resolveAuth() {
    throw new Error('Not implemented')
  }

  bind() {
    throw new Error('Not implemented')
  }
}

module.exports = { Transport }
