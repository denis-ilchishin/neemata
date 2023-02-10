'use strict'

const fsp = require('node:fs/promises')
const { join, extname, sep, parse, basename } = require('node:path')
const { isAsyncFunction } = require('node:util/types')
const { Script } = require('./vm')

class Loader {
  hooks = false
  recursive = true
  sandbox = {}
  modules = new Map()

  /**
   *
   * @param {string} path
   * @param {import('./application').WorkerApplication} application
   */
  constructor(path, application) {
    this.application = application
    this.path = join(application.rootPath, path)
  }

  namify(modulePath) {
    const { ext } = parse(modulePath)
    return modulePath.replace(ext, '').split(sep).join('.')
  }

  get(name) {
    const modulePath = Array.from(this.modules.keys()).find(
      (modulePath) => this.namify(modulePath) === name
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
      if (part === 'index' && parts.length > 1) {
        last = Object.assign(last, exports)
      } else {
        last[part] = last[part] ?? {}
        if (i + 1 === parts.length) {
          last[part] = Object.assign(last[part], exports)
        } else {
          last = last[part]
        }
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
      } else if (
        /\.(mjs|js|ts)/.test(extname(_path)) &&
        !_path.startsWith('.')
      ) {
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
      const script = new Script(filePath, {
        context: this.application.sandbox,
        rootPath: this.application.rootPath,
        application: this.application,
      })
      const { exports, hooks } = await script.execute()

      if (this.hooks) {
        for (const [hookname, hook] of Object.entries(hooks)) {
          if (Array.isArray(this.hooks) && !this.hooks.includes(hookname))
            continue
          if (this.application.hooks.has(hookname)) {
            if (isAsyncFunction(hook)) {
              this.application.hooks.get(hookname).add(hook)
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
      if (application.workerId === 1) {
        this.application.console.error(`Unable to load the module ${filePath}`)
        this.application.console.error(error)
      }
    }
  }

  async transform(exports) {
    return { exports }
  }
}

module.exports = {
  Loader,
}
