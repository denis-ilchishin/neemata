'use strict'

const { ApiException } = require('./exceptions')
const { ErrorCode, WorkerHook } = require('@neemata/common')
const { unique } = require('../utils/functions')
const zod = require('zod')
const { SEPARATOR } = require('../loader')
const { Scope } = require('../di')

class BaseTransport {
  constructor(server) {
    const { workerApp } = server
    const { namespaces, console, config } = workerApp
    this.server = server
    this.workerApp = workerApp
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

  async handleProcedure(container, procedureName, transport, ctx) {
    const providerName = `api${SEPARATOR}${procedureName}`
    const procedureProvider = container._registry.get(providerName)

    const notFound = new ApiException({
      code: ErrorCode.NotFound,
      data: 'a',
      message: 'Procedure not found',
    })

    if (!procedureProvider) throw notFound

    if (
      procedureProvider.transport &&
      procedureProvider.transport !== transport
    )
      throw notFound

    if (procedureProvider.auth !== false && ctx.auth === null) {
      throw new ApiException({
        code: ErrorCode.Unauthorized,
        message: 'Unauthorized',
      })
    }

    for (const middlewareName of Object.entries(procedureProvider.middlewares)
      .filter((_) => _[1] === true)
      .map((_) => _[0])) {
      const middleware = await container.resolve(middlewareName, ctx)
      const middlewareMixin = await middleware(ctx)
      if (middlewareMixin && typeof middlewareMixin === 'object')
        Object.assign(ctx, middlewareMixin)
    }

    await container.preload(Scope.Call, ctx)
    const procedure = await container.resolve(providerName, ctx)

    if (procedure.transport !== null && procedure.transport !== transport)
      throw notFound

    return { ...procedure, timeout: procedureProvider.timeout }
  }

  async handleAuth({ client, req }) {
    const dependencyName = this.workerApp.userApp.auth
    if (dependencyName) {
      const handler = await this.workerApp.container.resolve(dependencyName)
      return handler({ client, req })
        .catch(() => null)
        .then((result) => result ?? null)
    } else return null
  }

  async handle(procedureName, container, transport, ctx) {
    let data = ctx.data
    const auth = ctx.auth
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
      const procedure = await this.handleProcedure(
        container,
        procedureName,
        transport,
        ctx
      )

      data = procedure.input
        ? await this.handleInput(procedure.input, ctx.data)
        : undefined

      let result = await this.handleCall(procedure.handler, procedure.timeout, {
        data,
        auth,
      })

      if (procedure.output)
        result = await this.handleOutput(procedure.output, result)

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

  async handleInput(schema, data) {
    if (this.config.api.schema === 'zod') {
      const result = await schema.safeParseAsync(data)
      if (result.success) {
        return result.data
      } else {
        throw new ApiException({
          code: ErrorCode.ValidationError,
          message: 'Request body validation error',
          data: result.error.format(),
        })
      }
    } else {
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

  async handleOutput(schema, data) {
    if (this.config.api.schema === 'zod') {
      const result = await schema.safeParseAsync(data)
      if (result.success) {
        return result.data
      } else {
        throw new ApiException({
          code: ErrorCode.ValidationError,
          message: 'Request body validation error',
          data: result.error.format(),
        })
      }
    } else {
      return Value.Cast(schema, data)
    }
  }

  handleVersion(version) {
    const parsed = parseInt(version || 1)
    if (!Number.isSafeInteger(parsed) || parsed <= 0)
      throw new ApiException({
        code: ErrorCode.BadRequest,
        message: 'Invalid version',
      })
    return parsed
  }
}

module.exports = { BaseTransport }
