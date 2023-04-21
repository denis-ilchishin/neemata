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
      input = null,
      output = null,
      handler,
    }) => ({
      scope: Scope.Call,
      middlewares: { ...declaredMiddlewares, ...middlewares },
      deps: { ...declaredDeps, ...deps },
      auth: auth ?? declaredAuth,
      transport: transport ?? declaredTransport,
      timeout: timeout ?? declaredTimeout,
      factory: async (...args) => {
        const resolve = async (val) => {
          if (typeof val === 'function') return val(...args)
          if (typeof val === 'object') return val
        }
        const [_input, _output] = await Promise.all([
          resolve(input),
          resolve(output),
        ])
        return {
          input: _input,
          output: _output,
          handler: (..._args) => handler(...args, ..._args),
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
