'use strict'

const { existsSync } = require('node:fs')
const fsp = require('node:fs/promises')
const { join, parse, extname, sep } = require('node:path')
const { isAsyncFunction } = require('node:util/types')
const { Script } = require('./vm')

async function readFilesystem(root, nested = false, flat = false) {
  if (!existsSync(root)) return {}
  if (!(await fsp.stat(root)).isDirectory()) return {}

  const tree = {}

  const add = (treeLevel, entryName, entryPath, override = true) => {
    if (!override && entryName in treeLevel) return
    treeLevel[entryName] = treeLevel[entryName] ?? {}
    treeLevel[entryName]['index'] = entryPath
  }

  const isSupportedFile = (entryName) => {
    if (entryName.startsWith('.')) return false
    if (!/\.(js|ts)/.test(extname(entryName))) return false
    return true
  }

  const readdir = async (root) => {
    let entries = await fsp.readdir(root)
    entries = await Promise.all(
      entries.map(async (entryName) => {
        const entryPath = join(root, entryName)
        const stat = await fsp.stat(entryPath)
        if (stat.isDirectory()) return { entryName, entryPath, isFile: false }
        else if (stat.isFile() && isSupportedFile(entryName))
          return { entryName: parse(entryName).name, entryPath, isFile: true }
      })
    )
    return entries.filter((entry) => entry)
  }

  const traverse = async (tree, entries, level = 0) => {
    const traverseEntry = async ({ entryName, entryPath, isFile }) => {
      // Skip non-root index files, they should have been handled previously
      if (isFile && entryName === 'index' && level > 0) return
      if (isFile) add(tree, entryName, entryPath)
      else {
        const entries = await readdir(entryPath)
        const index = entries.find(({ entryName }) => entryName === 'index')
        if (index) add(tree, entryName, index.entryPath, false)
        if (nested && entries.length) {
          tree[entryName] = tree[entryName] ?? {}
          await traverse(tree[entryName], entries, level + 1)
        }
      }
    }
    await Promise.all(entries.map(traverseEntry))
  }

  await traverse(tree, await readdir(root))

  if (!flat) return tree

  const flatTree = {}

  // make flat tree
  const traverseFlat = (tree, path = '') => {
    for (const [key, value] of Object.entries(tree)) {
      if (key === 'index') {
        flatTree[path.split(sep).join('.')] = value
        continue
      }
      traverseFlat(value, join(path, key))
    }
  }
  traverseFlat(tree)
  return Object.fromEntries(
    Object.entries(flatTree).sort((a, b) => a[0] > b[0])
  )
}

class Loader {
  hooks = false
  recursive = true
  tree = {}
  modules = new Map()
  sandbox = {}

  /**
   * @param {string} path
   * @param {import('./application').WorkerApplication} application
   */
  constructor(path, application) {
    this.application = application
    this.path = join(application.rootPath, path)
  }

  get(name) {
    return this.modules.get(name)
  }

  makeSandbox(exports, moduleName) {
    let last = this.sandbox
    const parts = moduleName.split('.')
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const isLast = i === parts.length - 1
      if (isLast) {
        last[part] =
          typeof last[part] !== 'undefined'
            ? Object.assign(last[part], exports)
            : exports
      } else {
        last[part] = last[part] ?? {}
      }

      last = last[part]
    }
  }

  async load() {
    this.tree = await readFilesystem(this.path, this.recursive, true)
    await Promise.all(
      Object.entries(this.tree).map(([name, path]) =>
        this.loadModule(name, path)
      )
    )
    for (const moduleName of this.modules.keys()) {
      if (moduleName in this.tree) continue
      this.modules.delete(moduleName)
    }
  }

  async loadModule(moduleName, filePath) {
    try {
      const script = new Script(filePath, {
        context: this.application.sandbox,
        rootPath: this.application.rootPath,
      })
      const { exports, hooks } = await script.execute()

      if (typeof exports === 'undefined') return
      else if (this.hooks) {
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

      const transformed = await this.transform(
        exports,
        moduleName,
        filePath.replace(this.path, '').slice(1)
      )
      if (this.sandbox) this.makeSandbox(transformed, moduleName)
      this.modules.set(moduleName, transformed)
    } catch (error) {
      if (this.application.workerId === 1) {
        logger.warn(`Unable to load the module ${filePath}`)
        logger.error(error)
      }
    }
  }

  async transform(exports) {
    return exports
  }
}

module.exports = {
  Loader,
  readFilesystem,
}
