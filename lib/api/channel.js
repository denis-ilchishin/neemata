const { isAsyncFunction } = require('util/types')
const { ErrorCode } = require('../enums/error-code')
const { timeout } = require('../utils/helpers')
const { ApiException } = require('./exception')

class Channel {
  constructor(fastify, application) {
    this.fastify = fastify
    this.application = application

    this.authHandler = application.lib.get(application.appConfig.auth.lib)

    if (!isAsyncFunction(this.authHandler)) {
      throw new Error(
        'Auth lib specified in `config:auth.lib` must export async function',
        'Api'
      )
    }
  }

  makeResponse({ error = null, data = null }) {
    return { error, data }
  }

  makeError({ code, message = null, data = null }) {
    return this.makeResponse({ error: { code, message }, data })
  }

  async handleAuth(required, arg) {
    try {
      return this.apiModuleAuth(arg)
    } catch (err) {
      if (required) {
        throw err
      }
      return null
    }
  }

  async handleGuards(guards, arg) {
    for (const guard of guards) {
      await guard(arg)
    }
  }

  async handleApi(hander, arg) {
    return timeout(
      hander(arg),
      this.application.appConfig.timeouts.request,
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
