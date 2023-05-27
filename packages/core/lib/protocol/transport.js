'use strict'

const { ApiException } = require('./exceptions')
const { ErrorCode, WorkerHook } = require('@neemata/common')
const { unique } = require('../utils/functions')

class BaseTransport {
  constructor(server) {
    const { application } = server
    const { namespaces, config } = application
    this.server = server
    this.application = application
    this.namespaces = namespaces
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

  findProcedure(name, type) {
    const procedure = this.server.application.namespaces.api.get(name, type)

    if (!procedure)
      throw new ApiException({
        code: ErrorCode.NotFound,
        message: 'Procedure not found',
      })

    return procedure
  }

  async handle({ procedure, client, data, req, res }) {
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
      if (procedure.auth !== false && !client.auth) {
        throw new ApiException({
          code: ErrorCode.Unauthorized,
          message: 'Unauthorized',
        })
      }

      if (procedure.guards) {
        await this.handleGuards(procedure.guards, { client, data, req })
      }

      if (procedure.schema) {
        data = await this.handleValidation(procedure.schema, data)
      }

      this.application.runHooks(WorkerHook.Call, true, {
        client,
        data,
        req,
        res,
        procedure: { name: procedure.name },
      })

      const result = await this.handleCall(
        procedure.handler,
        procedure.timeout,
        {
          data,
          client,
          req,
          res,
        }
      )

      return this.makeResponse({ data: result })
    } catch (err) {
      if (err instanceof ApiException) {
        return this.makeError(err)
      } else {
        logger.error(err)
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
          timeout || this.config.timeouts.rpc.execution
        )
      ),
    ])
  }

  async handleValidation(schema, data) {
    const result = await schema.safeParseAsync(data)
    if (result.success) {
      return result.data
    } else {
      throw new ApiException({
        code: ErrorCode.ValidationError,
        message: 'Request body validation error',
        data: {
          zod: () => result.error.issues,
          'zod-format': () => result.error.format(),
          'zod-flatten': () => result.error.flatten(),
        }[this.config.api.schema](),
      })
    }
  }
}

module.exports = { BaseTransport }
