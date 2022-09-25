const { isAsyncFunction } = require('util/types')
const { ErrorCode } = require('../enums/error-code')
const { timeout } = require('../utils/helpers')
const { ApiException } = require('./exception')

class Channel {
  constructor(fastify, application) {
    this.fastify = fastify
    this.application = application

    if (!isAsyncFunction(this.authHandler)) {
      throw new Error(
        'Auth lib specified in `config:auth.lib` must export async function',
        'Api'
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

  resolveAuth() {
    throw new Error('Not implemented')
  }

  async handleAuth(auth) {
    return this.authHandler(auth)
  }

  async handleGuards(guards, arg) {
    for (const guard of guards) {
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
      handerTimeout ?? this.application.appConfig.timeouts.request,
      new ApiException({
        code: ErrorCode.GatewayTimeout,
        message: 'Request timeout',
      })
    )
  }

  async handleSchema(schema, data) {
    try {
      return await schema.validateAsync(data)
    } catch (error) {
      throw new ApiException({
        code: ErrorCode.ValidationError,
        message: 'Request body validation error',
        data: error,
      })
    }
  }
}

module.exports = { Channel }
