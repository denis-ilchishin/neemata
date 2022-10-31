'use strict'

const { isAsyncFunction } = require('node:util/types')
const { Loader } = require('../loader')

class Tasks extends Loader {
  sandbox = null

  constructor(application) {
    super('tasks', application)
  }

  async transform(exports) {
    if (!isAsyncFunction(exports))
      throw new Error('Task must be type of async function')

    return { exports }
  }
}

module.exports = { Tasks }
