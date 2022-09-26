const fsp = require('node:fs/promises')
const { join, extname, sep, parse, basename } = require('node:path')
const { isAsyncFunction } = require('node:util/types')
const { Script } = require('./vm')

class Loader {
  hooks = false
  recursive = true
  sandbox = {}

  constructor(path, application) {
    this.application = application
    this.modules = new Map()
    this.path = path
  }

  get(name) {
    const modulePath = Array.from(this.modules.keys()).find(
      (modulePath) => modulePath === name.split('.').join(sep) + '.js'
    )
    return modulePath ? this.modules.get(modulePath).exports : null
  }

  makeSandbox(modulePath, { exports }) {
    const tree = this.sandbox

    let last = tree

    const { dir, name } = parse(modulePath)

    const parts = dir ? dir.split(sep) : []
    parts.push(name)

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      last[part] = last[part] ?? {}
      if (i + 1 === parts.length) {
        last[part] = exports
      } else {
        last = last[part]
      }
    }
  }

  async load() {
    const stat = await fsp.stat(this.path)

    if (!stat.isDirectory) return

    const files = []

    let level = 0
    const traverse = async (path, name = '') => {
      level++
      const _path = join(path, name)
      const stat = await fsp.stat(_path)
      if ((this.recursive || level === 1) && stat.isDirectory()) {
        for (const name of await fsp.readdir(_path)) {
          await traverse(_path, name)
        }
      } else if (extname(_path) === '.js' && !_path.startsWith('.')) {
        files.push(_path.replace(this.path + sep, ''))
      }
    }

    await traverse(this.path)

    await Promise.all(files.map(this.loadModule.bind(this)))

    for (const modulePath of this.modules.keys()) {
      if (!files.includes(modulePath)) this.modules.delete(modulePath)
    }
  }

  async loadModule(modulePath) {
    const filePath = join(this.path, modulePath)
    try {
      const script = new Script(filePath, { context: this.application.sandbox })
      const { exports, ...hooks } = await script.run()

      if (this.hooks) {
        for (const [hookname, hook] of Object.entries(hooks)) {
          if (hookname in this.application.hooks) {
            if (isAsyncFunction(hook)) {
              this.application.hooks[hookname].add(hook)
            } else if (hook) {
              throw new Error('Hook must be type of async function')
            }
          }
        }
      }

      if (basename(filePath).startsWith('_') && exports === undefined) return

      const transformed = await this.transform(exports, modulePath)
      this.modules.set(modulePath, transformed)
      if (this.sandbox) this.makeSandbox(modulePath, transformed)
    } catch (error) {
      this.application.console.error(
        `Unable to load the module ${filePath}`,
        'Loader'
      )
      this.application.console.exception(error, 'Loader')
    }
  }

  async transform(exports) {
    return { exports }
  }
}

module.exports = {
  Loader,
}
