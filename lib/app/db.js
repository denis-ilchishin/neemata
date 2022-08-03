const { parse } = require('path')
const { isAsyncFunction } = require('util/types')
const { Loader } = require('../core/loader')

class Db extends Loader {
  recursive = false
  sandboxable = false
  databases = {}

  get sandbox() {
    return this.databases
  }

  async transform({ startup, shutdown }, modulePath) {
    const { name } = parse(modulePath)

    if (!isAsyncFunction(startup)) {
      throw new Error('`startup` must be an async function')
    }

    if (shutdown && !isAsyncFunction(shutdown)) {
      throw new Error('`shutdown` must be an async function')
    }

    this.application.hooks.startup.add(async (context) => {
      this.databases[name] = await startup(context)
    })

    if (shutdown) {
      this.application.hooks.shutdown.add((context) =>
        shutdown(this.databases[name], context)
      )
    }
  }
}

module.exports = { Db }
