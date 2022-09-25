const { isAsyncFunction } = require('node:util/types')
const { Loader } = require('../core/loader')

class Tasks extends Loader {
  sandbox = null

  async transform(exports) {
    if (!isAsyncFunction(exports))
      throw new Error('Task must be type of async function')

    return { exports }
  }
}

module.exports = { Tasks }
