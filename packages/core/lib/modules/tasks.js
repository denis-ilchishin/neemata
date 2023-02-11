'use strict'

const { isAsyncFunction } = require('node:util/types')
const { Loader } = require('../loader')

class Tasks extends Loader {
  sandbox = false

  constructor(application) {
    super('tasks', application)
  }

  async transform(exports) {
    if (!isAsyncFunction(exports))
      throw new Error('Task must be type of async function')
  }
}

module.exports = { Tasks }
