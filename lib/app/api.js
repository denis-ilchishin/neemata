const Joi = require('joi')
const { join, parse, sep } = require('path')
const { Protocol } = require('../enums/protocol')
const { Loader } = require('../core/loader')
const { satisfy } = require('../utils/semver')

class ApiModule {
  schema = null
  guards = null
  protocol = null
  auth = true

  constructor(exports) {
    if (typeof exports === 'function') {
      this.handler = exports
    } else {
      this.handler = exports.handler
      this.schema = exports.schema
      this.guards = exports.guards
      this.auth = exports.auth
      this.protocol = exports.protocol

      if (typeof this.handler !== 'function') {
        throw new Error("Api module 'handler' is invalid, should be a function")
      }
      if (this.schema && !Joi.isSchema(this.schema)) {
        throw new Error(
          "Api module 'schema' is invalid, should be a Joi schema"
        )
      }
      if (
        this.guards &&
        Joi.array().items(Joi.function()).validate(this.guards).error
      ) {
        throw new Error(
          "Api module 'guards' is invalid, should be a array of functions"
        )
      }
      if (Joi.bool().validate(this.auth).error) {
        throw new Error(
          "Api module 'auth' is invalid, should be a boolean value"
        )
      }

      if (
        this.protocol &&
        Joi.string().allow(Object.values(Protocol)).validate(this.protocol)
          .error
      ) {
        throw new Error(
          `Api module 'protocol' is invalid, must be one of: "${Object.values(
            Protocol
          ).join('", "')}"`
        )
      }
    }
  }
}

class Api extends Loader {
  hooks = false
  introspected = {}

  get(nameOrUrl, protocol, version = '*') {
    const module = Array.from(this.modules.values()).find(
      (module) =>
        (module.url === nameOrUrl || module.name === nameOrUrl) &&
        satisfy(module.version, version) &&
        (!module.protocol || module.protocol === protocol)
    )
    return module
  }

  async load() {
    await super.load()
    this.introspected = {}
    this.modules.forEach(({ name, url, protocol }) => {
      this.introspected[name] = { url, protocol }
    })
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
    module.version = versionParts.length ? versionParts.join('.') : '*'

    return module
  }
}

module.exports = { Api }
