const { createContext, Script: VmScript } = require('vm')
const { dirname } = require('path')
const { readFile } = require('fs/promises')
const Joi = require('joi')

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
  Joi,
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
    const module = { exports: undefined }

    closure({
      module,
      console,
      require,
      __dirname,
      __filename,
    })

    return module.exports
  }

  makeRequire() {
    // TODO: make `safe` require
    return require
  }

  makeConsole() {
    return console
  }

  makeContext() {
    const context = this.options.context ?? {}
    Object.assign(context, COMMON_CONTEXT)
    return createContext(context)
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
