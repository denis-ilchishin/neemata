const { isAsyncFunction } = require('util/types')
const { Loader } = require('../core/loader')

class Db extends Loader {
  recursive = false

  async transform(exports) {
    const module = { exports: null }

    if (!isAsyncFunction(exports.startup)) {
      throw new Error('`startup` must be an async function')
    }

    if (exports.shutdown && !isAsyncFunction(exports.shutdown)) {
      throw new Error('`shutdown` must be an async function')
    }

    this.application.hooks.startup.add(async () => {
      module.exports = await exports.startup()
    })

    if (exports.shutdown) {
      this.application.hooks.shutdown.add(() =>
        exports.shutdown(module.exports)
      )
    }

    return module
  }
}

module.exports = { Db }
