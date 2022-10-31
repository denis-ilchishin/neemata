'use strict'

const { Loader } = require('../loader')

class Config extends Loader {
  constructor(application) {
    super('config', application)
  }
}

module.exports = { Config }
