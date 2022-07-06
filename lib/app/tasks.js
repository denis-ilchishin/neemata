const { isAsyncFunction } = require('util/types')
const { Loader } = require('../core/loader')

class Tasks extends Loader {
  async transform(exports) {
    if (!isAsyncFunction(exports))
      throw new Error('Task must be type of async function')

    return { exports }
  }
}

module.exports = { Tasks }
