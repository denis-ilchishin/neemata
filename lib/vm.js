'use strict'

const { createContext, Script: VmScript } = require('node:vm')
const { dirname, parse, join } = require('node:path')
const { readFile } = require('node:fs/promises')
const { createRequire } = require('node:module')
const { ErrorCode, WorkerType } = require('./enums')
const { ApiException } = require('../exceptions')

const typingHelpers = [
  'defineAuthModule',
  'defineApiModule',
  'defineGuard',
  'defineConnectionHook',
]

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
  console,
  ErrorCode,
  WorkerType,
  ApiException,
  // Typing helpers
  ...Object.fromEntries(
    typingHelpers.map((name) => [name, ((value) => value).bind(undefined)])
  ),
})

const RUNNING_OPTIONS = {
  displayErrors: true,
}

class Script {
  constructor(filepath, options) {
    this.filepath = filepath
    this.options = options
  }

  async execute() {
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
    const exports = {}
    const hooks = {}
    const module = { exports, hooks }

    closure({
      module,
      require,
      exports,
      hooks,
      __dirname,
      __filename,
    })

    return module
  }

  makeRequire() {
    // TODO: make `safe` require
    const _require = createRequire(this.filepath)
    const handler = (id) => {
      const resolved = _require.resolve(id)
      const { name } = parse(resolved)
      if (
        id.startsWith(this.options.rootPath) &&
        (id.startsWith(join(this.options.rootPath, 'api')) ||
          (!name.startsWith('.') && !name.startsWith('_')))
      ) {
        throw new Error('Internal application module are auto injected')
      }
      return _require(id)
    }

    return Object.assign(handler, _require)
  }

  makeContext() {
    const context = { ...this.options.context, ...COMMON_CONTEXT }
    return createContext(Object.freeze(context))
  }

  makeSource(source) {
    return [
      "'use strict';",
      '(({module, require, exports, hooks, __filename, __dirname}) => {',
      source,
      '});',
    ].join('')
  }
}

module.exports = {
  Script,
}
