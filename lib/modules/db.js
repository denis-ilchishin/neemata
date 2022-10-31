'use strict'

const { Loader } = require('../loader')

class Db extends Loader {
  recursive = false
  hooks = true

  constructor(application) {
    super('db', application)
  }
}

module.exports = { Db }
