'use strict'

const {
  createContext,
  Script: CJSScript,
  SourceTextModule,
  SyntheticModule,
} = require('node:vm')
const { dirname, parse, extname, resolve } = require('node:path')
const { readFile } = require('node:fs/promises')
const { readFileSync } = require('node:fs')
const { createRequire } = require('node:module')
const { pathToFileURL } = require('node:url')
const { ErrorCode, WorkerType } = require('@neemata/common')
const { ApiException } = require('./protocol/exceptions')
const { BinaryHttpResponse } = require('./protocol/http')
const { Stream } = require('./protocol/stream')
const esbuld = require('esbuild')
const zod = require('zod')
const sourceMapSupport = require('source-map-support')

class Script {
  constructor(filepath, options) {
    this.filepath = filepath
    this.type = TYPES[extname(this.filepath)]
    this.options = options
    this.content = readFile(this.filepath).then((buff) =>
      buff.toString('utf-8')
    )
  }

  async execute() {
    return this[this.type]()
  }

  async es() {
    const hooksProxy = new Proxy(
      {},
      {
        set: (target, prop, value) => {
          target[prop] = target[prop] ?? new Set()
          target[prop].add(value)
          return true
        },
      }
    )
    const context = this.makeContext({ hooks: hooksProxy })
    const linker = this.makeLinker()

    const esmodule = new SourceTextModule(await this.content, {
      context,
      lineOffset: 0,
      identifier: this.filepath,
      initializeImportMeta: (meta) => {
        meta.url = pathToFileURL(this.filepath).toString()
      },
    })

    await esmodule.link(linker)
    await esmodule.evaluate()

    const hooks = context.hooks
    const { default: _default, ...other } = esmodule.namespace

    if ('default' in esmodule.namespace) {
      if (Object.keys(other).length) {
        if (typeof _default === 'undefined' || _default === null)
          throw Error(
            'Unabled to map merge exports because default export is typeof undefined or null'
          )
      }
      return { exports: Object.assign(_default, other), hooks }
    }

    return { exports: Object.keys(other).length ? other : undefined, hooks }
  }

  async ts() {
    const transpilation = await esbuld.transform(await this.content, {
      platform: 'node',
      target: 'es2022',
      ignoreAnnotations: true,
      loader: 'ts',
      minify: false,
      sourcemap: 'external',
      sourcefile: this.filepath,
    })
    SOUCRE_MAPS.set(this.filepath, JSON.parse(transpilation.map))
    this.content = transpilation.code
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
    const hooks = {}
    const module = { exports: {} }

    await closure({
      module,
      require,
      hooks,
      __dirname,
      __filename,
    })

    return { exports: module.exports, hooks }
  }

  makeRequire() {
    const _require = createRequire(this.filepath)
    const handler = (specifier) => {
      const resolved = _require.resolve(specifier)
      if (resolved.startsWith(this.options.rootPath))
        throw Error('Unable to require local application modules')
      return _require(specifier)
    }
    return Object.assign(handler, _require)
  }

  makeContext(extra = {}) {
    const context = { ...COMMON_CONTEXT, ...this.options.context, ...extra }
    return createContext(context)
  }

  makeLinker() {
    return async (specifier, _ref) => {
      const isPackageName = !['.', '/'].includes(specifier[0])

      function asSyntheticModule(exports) {
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

      async function native(specifier) {
        const exports = await import(specifier)
        return asSyntheticModule(exports)
      }

      if (isPackageName) {
        try {
          return await native(specifier)
        } catch (error) {
          return native(resolve('node_modules', specifier))
        }
      } else {
        let targetPath =
          specifier[0] === '/'
            ? specifier
            : resolve(dirname(this.filepath), specifier)
        if (!targetPath.startsWith(this.options.rootPath))
          return native(targetPath)
        const { ext } = parse(targetPath)
        const type = this.type === 'ts' && ext === '' ? 'ts' : TYPES[ext]
        if (!type) return native(targetPath)
        targetPath = type === 'ts' ? targetPath + '.ts' : targetPath
        const script = new Script(targetPath, this.options)
        const { exports } = await script.execute(true)
        return asSyntheticModule(exports)
      }
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
  AbortController,
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
  Error,
  BinaryHttpResponse,
  // Typing helpers
  ...Object.fromEntries(
    typingHelpers.map((name) => [name, ((value) => value).bind(undefined)])
  ),
})

const RUNNING_OPTIONS = {
  displayErrors: true,
}

const TYPES = {
  '.mjs': 'es',
  '.js': 'es',
  '.ts': 'ts',
}

const SOUCRE_MAPS = new Map()

sourceMapSupport.install({
  retrieveSourceMap(source) {
    const map = SOUCRE_MAPS.get(source)
    if (map) return { url: source, map }
  },
})

function clearVM() {
  SOUCRE_MAPS.clear()
  Typebox.Custom.Clear()
  Typebox.Stream = Typebox.TypeSystem.CreateType('Stream', (options, value) => {
    if (!(value instanceof Stream)) return false
    if (options.maximum !== undefined && value.meta.size > options.maximum)
      return false
    return true
  })
}

module.exports = {
  Script,
  clearVM,
  TYPES,
}
