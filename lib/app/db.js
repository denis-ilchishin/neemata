const { Loader } = require('../core/loader')

class Db extends Loader {
  recursive = false
  hooks = true
}

module.exports = { Db }
