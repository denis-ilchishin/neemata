'use strict'

const { Scope } = require('./di')

class UserApplication {
  auth

  declareProcedure({
    deps: declaredDeps = {},
    middlewares: declaredMiddlewares = {},
    options: {
      auth: declaredAuth = null,
      transport: declaredTransport = null,
      input: declaredInput = null,
      timeout: declaredTimeout = null,
    } = {},
  } = {}) {
    return ({ deps = {}, middlewares = {}, factory }) => ({
      scope: Scope.Call,
      middlewares: { ...declaredMiddlewares, ...middlewares },
      deps: { ...declaredDeps, ...deps },
      factory: async (...args) => {
        const value = await factory(...args)
        return typeof value === 'function'
          ? {
              handler: value,
              auth: declaredAuth,
              transport: declaredTransport,
              input: declaredInput,
              timeout: declaredTimeout,
            }
          : {
              handler: value.handler,
              auth: value.auth ?? declaredAuth,
              transport: value.transport ?? declaredTransport,
              input: value.input ?? declaredInput,
              timeout: value.timeout ?? declaredTimeout,
            }
      },
    })
  }

  declareProvider(injectable) {
    return typeof injectable === 'function'
      ? {
          scope: Scope.Default,
          deps: {},
          factory: injectable,
        }
      : {
          scope: injectable.scope ?? Scope.Default,
          deps: injectable.deps ?? {},
          factory: injectable.factory,
          dispose: injectable.dispose,
        }
  }

  declareAuthProvider(injectable) {
    return this.declareProvider({
      scope: Scope.Connection,
      ...(typeof injectable === 'function'
        ? { factory: injectable, deps: {} }
        : {
            factory: injectable.factory,
            dispose: injectable.dispose,
            deps: injectable.deps ?? {},
          }),
    })
  }

  declareMiddleware(injectable) {
    return this.declareProvider({
      scope: Scope.Call,
      ...(typeof injectable === 'function'
        ? { factory: injectable, deps: {} }
        : {
            factory: injectable.factory,
            dispose: injectable.dispose,
            deps: injectable.deps ?? {},
          }),
    })
  }
}

module.exports = { UserApplication }
