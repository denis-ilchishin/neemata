'use strict'

const { Scope } = require('./di')

class UserApplication {
  auth

  declareProcedure({
    deps: declaredDeps = {},
    middlewares: declaredMiddlewares = {},
    auth: declaredAuth = null,
    transport: declaredTransport = null,
    timeout: declaredTimeout = null,
  } = {}) {
    return ({
      deps = {},
      middlewares = {},
      auth = null,
      transport = null,
      timeout = null,
      factory,
    }) => ({
      scope: Scope.Call,
      middlewares: { ...declaredMiddlewares, ...middlewares },
      deps: { ...declaredDeps, ...deps },
      factory: async (...args) => {
        const value = await factory(...args)
        return typeof value === 'function'
          ? {
              auth: declaredAuth,
              transport: declaredTransport,
              timeout: declaredTimeout,
              handler: value,
              input: null,
            }
          : {
              auth: auth ?? declaredAuth,
              transport: transport ?? declaredTransport,
              timeout: timeout ?? declaredTimeout,
              handler: value.handler,
              input: value.input,
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
