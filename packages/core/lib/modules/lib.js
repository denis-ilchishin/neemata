'use strict'

const { Loader } = require('../loader')

class Lib extends Loader {
  hooks = [WorkerHook.Startup, WorkerHook.Shutdown]

  constructor(application) {
    super('lib', application)
  }
}

module.exports = { Lib }
