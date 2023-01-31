'use strict'

const { ApiException } = require('./exceptions')
const { ErrorCode } = require('@neemata/common')
const { unique } = require('../utils/functions')

class BaseTransport {
  constructor(server) {
    const { application } = server
    const { modules, console, config } = application
    this.server = server
    this.application = application
    this.modules = modules
    this.console = console
    this.config = config
  }

  receiver() {
    throw new Error('Not implemented')
  }

  deserialize(raw) {
    return JSON.parse(raw)
  }

  serialize(value) {
    return JSON.stringify(value)
  }

  makeResponse({ error = null, data = null }) {
    return { error, data }
  }

  makeError({ code, message = 'Unexpected Server error', data = null }) {
    return this.makeResponse({ error: { code, message }, data })
  }

  getApiModule(name, type, version) {
    const apiModule = this.server.application.modules.api.get(
      name,
      type,
      version
    )

    if (!apiModule)
      throw new ApiException({
        code: ErrorCode.NotFound,
        message: 'Module not found',
      })

    return apiModule
  }

  async handle({ apiModule, client, data, req }) {
    try {
      await this.server.queue.enter()
    } catch (err) {
      if (err.message === 'Semaphore queue is full') {
        return this.makeError({
          code: ErrorCode.ServiceUnavailable,
          message: 'Service overloaded',
        })
      } else if (err.message === 'Semaphore timeout') {
        return this.makeError({
          code: ErrorCode.GatewayTimeout,
          message: 'Service timeout',
        })
      }
    }

    try {
      if (apiModule.auth !== false && !client.auth) {
        throw new ApiException({
          code: ErrorCode.Unauthorized,
          message: 'Unauthorized',
        })
      }

      if (apiModule.guards) {
        await this.handleGuards(apiModule.guards, { client, data, req })
      }

      if (apiModule.schema) {
        data = await this.handleValidation(apiModule.schema, data)
      }

      this.application.runHooks('call', true, {
        client,
        data,
        req,
        trasport: this.trasport,
        module: { name: apiModule.name, version: apiModule.version },
      })

      const result = await this.handleCall(
        apiModule.handler,
        apiModule.timeout,
        {
          data,
          client,
          req,
          trasport: this.trasport,
        }
      )

      return this.makeResponse({ data: result })
    } catch (err) {
      if (err instanceof ApiException) {
        return this.makeError(err)
      } else {
        return this.makeError({
          code: ErrorCode.InternalServerError,
        })
      }
    } finally {
      this.server.queue.leave()
    }
  }

  async handleGuards(guards, params) {
    return Promise.all(
      unique(guards).map(async (guard) => {
        const hasAccess = await guard(params)
        if (!hasAccess)
          throw new ApiException({
            code: ErrorCode.Forbidden,
            message: 'Forbidden',
          })
      })
    )
  }

  async handleCall(callHandler, timeout, params) {
    return Promise.race([
      callHandler(params),
      new Promise((_, reject) =>
        setTimeout(
          () =>
            reject(
              new ApiException({
                code: ErrorCode.RequestTimeout,
                message: 'Request timeout',
              })
            ),
          timeout || this.config.timeouts.request
        )
      ),
    ])
  }

  async handleValidation(schema, data) {
    if (schema.Check(data)) {
      return data // schema.Cast(data)
    } else {
      throw new ApiException({
        code: ErrorCode.ValidationError,
        message: 'Request body validation error',
        data: [...schema.Errors(data)],
      })
    }
  }
}

module.exports = { BaseTransport }
