const { createContext, Script: VmScript } = require('node:vm')
const { dirname } = require('node:path')
const { readFile } = require('node:fs/promises')
const { createRequire } = require('node:module')

const COMMON_CONTEXT = Object.freeze({
  Buffer,
  URL,
  URLSearchParams,
  TextDecoder,
  TextEncoder,
  queueMicrotask,
  setTimeout,
  setImmediate,
  setInterval,
  clearTimeout,
  clearImmediate,
  clearInterval,
  process,
})

const RUNNING_OPTIONS = {
  displayErrors: true,
}

class Script {
  constructor(filepath, options) {
    this.filepath = filepath
    this.options = options
  }

  async run() {
    const source = this.makeSource(await readFile(this.filepath))
    const context = this.makeContext()

    const options = {
      ...RUNNING_OPTIONS,
      filename: this.filepath,
      lineOffset: 0,
    }

    const closure = new VmScript(source, options).runInContext(context, options)

    return this.resolve(closure)
  }

  resolve(closure) {
    const __filename = this.filepath
    const __dirname = dirname(this.filepath)
    const require = this.makeRequire()
    const console = this.makeConsole()
    const module = {}

    closure({
      module,
      console,
      require,
      __dirname,
      __filename,
    })

    return module
  }

  makeRequire() {
    // TODO: make `safe` require
    return createRequire(this.filepath)
  }

  makeConsole() {
    return console
  }

  makeContext() {
    const context = { ...this.options.context, ...COMMON_CONTEXT }
    return createContext(Object.freeze(context))
  }

  makeSource(source) {
    return [
      "'use strict';",
      '(({module, require, console, __filename, __dirname}) => {',
      source,
      '})',
    ].join('')
  }
}

module.exports = {
  Script,
}
