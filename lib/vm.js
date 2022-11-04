'use strict'

const {
  createContext,
  Script: CJSScript,
  SourceTextModule,
  SyntheticModule,
} = require('node:vm')
const { dirname, parse, extname } = require('node:path')
const { readFile } = require('node:fs/promises')
const { createRequire } = require('node:module')
const { pathToFileURL } = require('node:url')
const { ErrorCode, WorkerType } = require('./enums')
const { ApiException } = require('./exceptions')

const typingHelpers = ['defineAuthModule', 'defineApiModule', 'defineGuard']

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
    this.type = extname(this.filepath) === '.mjs' ? 'es' : 'cjs'
    this.options = options
    this.content = readFile(this.filepath).then((buff) =>
      buff.toString('utf-8')
    )
  }

  async execute() {
    return this[this.type]()
  }

  async es() {
    const context = this.makeContext({ hooks: {} })
    const esmodule = new SourceTextModule(await this.content, {
      context,
      lineOffset: 0,
      initializeImportMeta: (meta) => {
        meta.url = pathToFileURL(this.filepath).toString()
      },
    })
    const linker = this.makeLinker()
    await esmodule.link(linker)
    await esmodule.evaluate()
    const { default: _default, ...rest } = esmodule.namespace

    return {
      exports: Object.assign(_default ?? {}, rest),
      hooks: context.hooks,
    }
  }

  async cjs() {
    const source = [
      "'use strict';",
      '(async ({module, require, exports, hooks, __filename, __dirname}) => {',
      await this.content,
      '});',
    ].join('')
    const context = this.makeContext()

    const options = {
      ...RUNNING_OPTIONS,
      filename: this.filepath,
      lineOffset: 0,
    }

    const closure = new CJSScript(source, options).runInContext(
      context,
      options
    )

    const __filename = this.filepath
    const __dirname = dirname(this.filepath)
    const require = this.makeRequire()
    const exports = {}
    const hooks = {}
    const module = { exports, hooks }

    await closure({
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
        resolved.startsWith(this.options.rootPath) &&
        !name.startsWith('.') &&
        !name.startsWith('_')
      ) {
        throw new Error('Internal application modules are auto injected')
      }
      return _require(id)
    }

    return Object.assign(handler, _require)
  }

  makeContext(extra = {}) {
    const context = { ...COMMON_CONTEXT, ...this.options.context, ...extra }
    return createContext(context)
  }

  makeLinker() {
    const _require = createRequire(this.filepath)
    return async (id, _ref) => {
      const resolved = _require.resolve(id)
      const { name } = parse(resolved)

      if (
        resolved.startsWith(this.options.rootPath) &&
        !name.startsWith('.') &&
        !name.startsWith('_')
      ) {
        throw new Error('Internal application modules are auto injected')
      }

      const exports = await import(id)

      return new SyntheticModule(
        Array.from(new Set(['default', ...Object.keys(exports)])),
        function () {
          this.setExport('default', exports.default ?? exports)
          for (const [key, value] of Object.entries(exports)) {
            this.setExport(key, value)
          }
        },
        { context: _ref.context }
      )
    }
  }
}

module.exports = {
  Script,
}
