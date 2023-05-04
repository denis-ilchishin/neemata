'use strict'

const { TypeGuard } = require('@sinclair/typebox/guard')
const { parse, sep } = require('node:path')
const { Loader } = require('../loader')
const { Transport } = require('@neemata/common')
const { compileSchema } = require('../utils/functions')
const zod = require('zod')

class Procedure {
  constructor(exports, schemaType) {
    const {
      handler,
      schema = null,
      guards = [],
      transport = null,
      timeout = null,
      auth = true,
      introspectable = true,
      allowGetMethod = false,
    } = exports

    this.handler = handler
    this.schema = schema
    this.guards = guards
    this.auth = auth
    this.transport = transport
    this.timeout = timeout
    this.introspectable = introspectable

    if (typeof this.handler !== 'function') {
      throw new Error("Procedure's 'handler' is invalid, should be a function")
    }

    if (this.schema) {
      if (schemaType === 'typebox' && !TypeGuard.TSchema(this.schema)) {
        throw new Error(
          "Procedure's 'schema' is invalid, should be a Typebox schema"
        )
      }

      if (schemaType === 'zod' && !(this.schema instanceof zod.ZodSchema)) {
        throw new Error(
          "Procedure's 'schema' is invalid, should be a Zod schema"
        )
      }

      if (schemaType === 'typebox') {
        this.schema = compileSchema(this.schema)
      }
    }

    if (this.guards.find((g) => typeof g !== 'function')) {
      throw new Error(
        "Procedure's 'guards' is invalid, should be boolean or an array of guard functions"
      )
    }
    if (typeof this.auth !== 'boolean') {
      throw new Error(
        "Procedure's 'auth' is invalid, should be a boolean value"
      )
    }

    if (typeof this.allowGetMethod !== 'boolean') {
      throw new Error(
        "Procedure's 'allowGetMethod' is invalid, should be a boolean value"
      )
    }

    if (
      this.introspectable !== 'guards' &&
      typeof this.introspectable !== 'function' &&
      typeof this.introspectable !== 'boolean'
    ) {
      throw new Error(
        `Procedure's 'introspeclable' is invalid, should be a boolean value, "guards" or custom guard-like function`
      )
    }

    if (this.transport && !Object.values(Transport).includes(this.transport)) {
      throw new Error("Procedure's 'transport' is invalid")
    }

    if (
      this.timeout &&
      (!Number.isSafeInteger(this.timeout) || this.timeout <= 0)
    ) {
      throw new Error(
        "Procedure's 'timeout' is invalid, should be a positive integer"
      )
    }
  }
}

class Api extends Loader {
  hooks = false
  sandbox = false

  constructor(application) {
    super('api', application)
  }

  get(name, transport) {
    const procedure = Array.from(this.modules.values()).find(
      (procedure) =>
        procedure.name === name &&
        (!procedure.transport || procedure.transport === transport)
    )
    return procedure
  }

  async transform(exports, moduleName, modulePath) {
    const { dir, name: filename } = parse(modulePath)
    const procedure = new Procedure(exports, this.application.config.api.schema)
    procedure.name = [...(dir ? dir.split(sep) : []), filename].join('.')
    return procedure
  }
}

module.exports = { Api }
