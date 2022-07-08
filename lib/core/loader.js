const fsp = require('fs/promises')
const { join, extname, sep, parse } = require('path')
const { isAsyncFunction } = require('util/types')
const { Script } = require('./vm')

class Loader {
  hooks = false
  recursive = true
  sandboxable = true

  constructor(path, application) {
    this.application = application
    this.modules = new Map()
    this.path = path
  }

  get(name) {
    const modulePath = Array.from(this.modules.keys()).find(
      (modulePath) => modulePath === name.split('.').join(sep) + '.js'
    )
    return module ? this.modules.get(modulePath).exports : null
  }

  makeSandbox() {
    const tree = {}
    let last = tree

    for (const [modulePath, { exports }] of this.modules.entries()) {
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

      last = tree
    }

    this.sandbox = tree
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

    if (this.sandboxable) this.makeSandbox()
  }

  async loadModule(modulePath) {
    const filePath = join(this.path, modulePath)
    try {
      const script = new Script(filePath, { context: this.application.sandbox })
      const exports = await script.run()

      if (this.hooks) {
        const { name } = parse(modulePath)
        const isHook = name.startsWith('_')
        const hookname = name.slice(1)
        if (isHook && hookname in this.application.hooks) {
          if (isAsyncFunction(exports)) {
            this.application.hooks[hookname].add(exports)
            return
          } else if (exports) {
            throw new Error('Hook must be type of async function')
          }
        }
      }

      this.modules.set(
        modulePath,
        Object.freeze(await this.transform(exports, modulePath))
      )
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
