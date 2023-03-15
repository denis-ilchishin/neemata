'use strict'

const { isAsyncFunction } = require('node:util/types')
const { Loader } = require('../loader')

class Services extends Loader {
  hooks = true

  constructor(application) {
    super('services', application)
  }

  async load(...args) {
    await super.load(...args)
    const authService = this.get(this.application.config.api.auth.service)
    if (!isAsyncFunction(authService)) {
      logger.error('Auth service must be an async function')
    }
  }
}

module.exports = { Services }
