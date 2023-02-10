'use strict'

const { WorkerHook } = require('@neemata/common')
const { Loader } = require('../loader')

class Db extends Loader {
  recursive = false
  hooks = [WorkerHook.Startup, WorkerHook.Shutdown]

  constructor(application) {
    super('db', application)
  }
}

module.exports = { Db }
