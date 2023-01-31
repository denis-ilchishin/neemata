'use strict'

const { TypeGuard } = require('@sinclair/typebox/guard')

const { parse, sep } = require('node:path')
const { Loader } = require('../loader')
const { Transport } = require('@neemata/common')
const { createSort, satisfy, compileSchema } = require('../utils/functions')

class ApiModule {
  constructor(exports) {
    if (typeof exports === 'function') {
      this.handler = exports
    } else {
      const {
        handler,
        schema = null,
        guards = [],
        transport = null,
        timeout = null,
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

      if (this.schema && !TypeGuard.TSchema(this.schema)) {
        throw new Error(
          "Api module 'schema' is invalid, should be a Typebox schema"
        )
      } else if (this.schema) {
        this.schema = compileSchema(this.schema)
      }

      if (this.guards.find((g) => typeof g !== 'function')) {
        throw new Error(
          "Api module 'guards' is invalid, should be boolean or an array of guard functions"
        )
      }
      if (typeof this.auth !== 'boolean') {
        throw new Error(
          "Api module 'auth' is invalid, should be a boolean value"
        )
      }

      if (
        this.introspectable !== 'guards' &&
        typeof this.introspectable !== 'function' &&
        typeof this.introspectable !== 'boolean'
      ) {
        throw new Error(
          'Api module \'introspeclable\' is invalid, should be a boolean value, "guards" or custom guard-like function'
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
  modules = new Map()
  hooks = false

  constructor(application) {
    super('api', application)
  }

  get(name, transport, version = '1') {
    const module = Array.from(this.modules.values())
      .filter((module) => module.name === name)
      .sort(createSort((item) => item.version))
      .filter((module) => satisfy(version, module.version))
      .find((module) => !module.transport || module.transport === transport)
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

    if (versionParts.length > 1)
      throw new Error('Should not be not more than one version specified')

    module.name = nameParts.join('.')
    module.version = versionParts.length ? versionParts[0] : '1'

    return module
  }
}

module.exports = { Api }
