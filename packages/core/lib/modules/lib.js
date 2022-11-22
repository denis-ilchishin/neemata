'use strict'

const { Loader } = require('../loader')

class Lib extends Loader {
  hooks = true

  constructor(application) {
    super('lib', application)
  }
}

module.exports = { Lib }
