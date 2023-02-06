'use strict'

const {
  createContext,
  Script: CJSScript,
  SourceTextModule,
  SyntheticModule,
} = require('node:vm')
const { dirname, parse, extname, resolve, relative } = require('node:path')
const { readFile } = require('node:fs/promises')
const { readFileSync } = require('node:fs')
const { createRequire } = require('node:module')
const { pathToFileURL } = require('node:url')
const { ErrorCode, WorkerType } = require('@neemata/common')
const { ApiException } = require('./protocol/exceptions')
const { Stream } = require('./protocol/stream')
const esbuld = require('esbuild')
const zod = require('zod')

class Script {
  constructor(filepath, options) {
    this.filepath = filepath
    this.type = types[extname(this.filepath)]
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
      identifier: this.filepath,
      initializeImportMeta: (meta) => {
        meta.url = pathToFileURL(this.filepath).toString()
      },
    })
    const linker = this.makeLinker()
    await esmodule.link(linker)
    await esmodule.evaluate()

    const { default: _default } = esmodule.namespace

    if (!('default' in esmodule.namespace)) {
      this.options.application.console.warn(
        this.filepath +
          ': ECMAScript and Typescript modules must have default exports for typing annotations to work properly'
      )
    }

    return {
      exports: _default,
      hooks: context.hooks,
    }
  }

  async ts() {
    this.content = esbuld
      .transform(await this.content, {
        target: 'es2022',
        ignoreAnnotations: true,
        loader: 'ts',
      })
      .then((result) => result.code)

    return this.es()
  }

  async cjs() {
    const source = [
      "'use strict';",
      '(async ({module, require, exports, hooks, __filename, __dirname}) => {',
      await this.content,
      '});',
    ].join('\n')
    const context = this.makeContext()

    /**
     * @type {import('node:vm').ScriptOptions}
     */
    const options = {
      ...RUNNING_OPTIONS,
      filename: this.filepath,
      lineOffset: -2,
      displayErrors: true,
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
        throw new Error(
          "Internal application modules are auto injected, there's no need to do it manually"
        )
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
        throw new Error(
          "Internal application modules are auto injected, there's no need to do it manually"
        )
      }

      const exports = await import(
        id.startsWith('.')
          ? relative(__dirname, resolve(this.filepath, id))
          : id
      )

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

const typingHelpers = ['defineProcedure', 'defineAuthService', 'defineGuard']

const typeBoxExports = JSON.parse(
  readFileSync(
    resolve(dirname(require.resolve('@sinclair/typebox')), 'package.json')
  ).toString()
).exports

let Typebox = {}

for (const key of Object.keys(typeBoxExports)) {
  const importName = key.replace('.', '')

  if (importName !== '')
    Typebox = {
      ...Typebox,
      ...require('@sinclair/typebox' + importName),
    }
  else Typebox = { ...Typebox, ...require('@sinclair/typebox') }
}

function prepareTypebox() {
  Typebox.Custom.Clear()
  Typebox.Stream = Typebox.TypeSystem.CreateType('Stream', (options, value) => {
    if (!(value instanceof Stream)) return false
    if (options.maximum !== undefined && value.meta.size > options.maximum)
      return false
    return true
  })
}

zod.stream = (options) =>
  zod.any().superRefine(
    (value, ctx) => {
      if (!(value instanceof Stream)) {
        ctx.addIssue({
          code: zod.ZodIssueCode.custom,
          message: 'Stream not found',
        })
      } else if (
        options.maximum !== undefined &&
        value.meta.size > options.maximum
      ) {
        ctx.addIssue({
          code: zod.ZodIssueCode.too_big,
          message: 'Stream data size is too big',
          maximum: options.maximum,
          type: 'number',
          inclusive: true,
        })
      }
    },
    { message: 'Invalid stream' }
  )

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
  Typebox,
  zod,
  Stream,
  // Typing helpers
  ...Object.fromEntries(
    typingHelpers.map((name) => [name, ((value) => value).bind(undefined)])
  ),
})

const RUNNING_OPTIONS = {
  displayErrors: true,
}

const types = {
  '.mjs': 'es',
  '.js': 'cjs',
  '.ts': 'ts',
}

module.exports = {
  Script,
  prepareTypebox,
}
