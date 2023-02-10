'use strict'

const { WorkerHook } = require('@neemata/common')
const { Loader } = require('../loader')

class Lib extends Loader {
  hooks = [WorkerHook.Startup, WorkerHook.Shutdown]

  constructor(application) {
    super('lib', application)
  }
}

module.exports = { Lib }
