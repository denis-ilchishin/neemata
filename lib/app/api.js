const Zod = require('zod')
const { join, parse, sep } = require('node:path')
const { Protocol } = require('../enums/protocol')
const { Loader } = require('../core/loader')
const { satisfy } = require('../utils/semver')

class ApiModule {
  schema = null
  guards = null
  protocol = null
  timeout = null
  auth = true
  introspectable = true

  constructor(exports) {
    if (typeof exports === 'function') {
      this.handler = exports
    } else {
      const {
        handler,
        schema,
        guards,
        protocol,
        timeout,
        auth = true,
        introspectable = true,
      } = exports

      this.handler = handler
      this.schema = schema
      this.guards = guards
      this.auth = auth
      this.protocol = protocol
      this.timeout = timeout
      this.introspectable = introspectable

      if (typeof this.handler !== 'function') {
        throw new Error("Api module 'handler' is invalid, should be a function")
      }

      if (this.schema && !(this.schema instanceof Zod.ZodType)) {
        throw new Error(
          "Api module 'schema' is invalid, should be a Zod schema"
        )
      }
      if (this.guards && this.guards.find((g) => typeof g !== 'function')) {
        throw new Error(
          "Api module 'guards' is invalid, should be a array of functions"
        )
      }
      if (typeof this.auth !== 'boolean') {
        throw new Error(
          "Api module 'auth' is invalid, should be a boolean value"
        )
      }

      if (
        typeof this.introspectable !== 'function' &&
        typeof this.introspectable !== 'boolean'
      ) {
        throw new Error(
          "Api module 'introspeclable' is invalid, should be a boolean value or a function"
        )
      }

      if (this.protocol && !Object.values(Protocol).includes(this.protocol)) {
        throw new Error(
          `Api module 'protocol' is invalid, must be one of: "${Object.values(
            Protocol
          ).join('", "')}"`
        )
      }

      if (
        this.timeout &&
        (!Number.isInteger(this.timeout) || this.timeout <= 0)
      ) {
        throw new Error(
          "Api module 'timeout' is invalid, should be a positive number"
        )
      }
    }
  }
}

class Api extends Loader {
  hooks = false

  get(nameOrUrl, protocol, version = '1') {
    const module = Array.from(this.modules.values())
      .filter((module) => [module.url, module.name].includes(nameOrUrl))
      .sort((a, b) => (b.version < a.version ? -1 : 1))
      .find(
        (module) =>
          satisfy(module.version, version) &&
          (!module.protocol || module.protocol === protocol)
      )
    return module
  }

  async transform(exports, modulePath) {
    let { dir, name } = parse(modulePath)

    const nameParts = []
    const versionParts = []

    const namespaces = (dir ? dir.split(sep) : []).map((part) =>
      part.split('.')
    )
    namespaces.push(name.split('.'))

    for (const [name, ...versions] of namespaces) {
      nameParts.push(name)
      versionParts.push(...versions)
    }

    const module = new ApiModule(exports)

    module.name = nameParts.join('.')
    module.url = join(...nameParts)
    module.version = versionParts.length ? versionParts.join('.') : '1'

    return module
  }
}

module.exports = { Api }
