'use strict'

const Zod = require('zod')
const { parse, sep } = require('node:path')
const { Loader } = require('../loader')
const { Transport } = require('@neemata/common')
const { versioning } = require('../utils')

class ApiModule {
  /**
   * @type {string}
   */
  name
  /**
   * @type {string}
   */
  url
  /**
   * @type {string}
   */
  version

  schema = null
  guards = null
  transport = null
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
        transport,
        timeout,
        auth = true,
        introspectable = true,
      } = exports

      this.handler = handler
      this.schema = schema
      this.guards = guards
      this.auth = auth
      this.transport = transport
      this.timeout = timeout
      this.introspectable = introspectable

      if (typeof this.handler !== 'function') {
        throw new Error("Api module 'handler' is invalid, should be a function")
      }

      // TODO: another way to validate schema for both cjs or es modules
      // if (this.schema && !(this.schema instanceof Zod.ZodType)) {
      //   throw new Error(
      //     "Api module 'schema' is invalid, should be a Zod schema"
      //   )
      // }

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

      if (
        this.transport &&
        !Object.values(Transport).includes(this.transport)
      ) {
        throw new Error("Api module 'transport' is invalid")
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
  /**
   * @type {Map<string, ApiModule>}
   */
  modules = new Map()
  hooks = false

  constructor(application) {
    super('api', application)
  }

  /**
   *
   * @param {string} nameOrUrl
   * @param {keyof Transport} transport
   * @param {string} [version=1]
   * @returns {ApiModule}
   */
  get(nameOrUrl, transport, version = '1') {
    const module = Array.from(this.modules.values())
      .filter((module) => [module.url, module.name].includes(nameOrUrl))
      .sort(versioning.sort((item) => item.version))
      .find(
        (module) =>
          versioning.satisfy(version, module.version) &&
          (!module.transport || module.transport === transport)
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

    module.name = nameParts
      // TODO: fix naming conversion
      // .map((part) =>
      //   part
      //     .toLowerCase()
      //     .replace(/([-_][a-z])/g, (group) =>
      //       group.toUpperCase().replace('-', '').replace('_', '')
      //     )
      // )
      .join('.')
    module.url = nameParts.join('/')
    module.version = versionParts.length ? versionParts.join('.') : '1'

    return module
  }
}

module.exports = { Api }
