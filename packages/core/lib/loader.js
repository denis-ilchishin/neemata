'use strict'

const { existsSync } = require('node:fs')
const fsp = require('node:fs/promises')
const { join, parse, extname, sep } = require('node:path')
const { isAsyncFunction } = require('node:util/types')
const { Script } = require('./vm')

const SEPARATOR = '.'

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
    if (!/\.(js|ts|mjs)/.test(extname(entryName))) return false
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
  const traverseFlat = (tree, path = '') => {
    for (const [key, value] of Object.entries(tree)) {
      if (key === 'index') {
        flatTree[path.split(sep).join(SEPARATOR)] = value
        continue
      }
      traverseFlat(value, join(path, key))
    }
  }
  traverseFlat(tree)
  return flatTree
}

class Loader {
  hooks = false
  recursive = true
  modules = new Map()
  entries = new Map()
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

  clear() {
    this.entries.clear()
    this.modules.clear()
  }

  async preload() {
    const modules = await readFilesystem(this.path, this.recursive, true)
    this.entries = new Map(Object.entries(modules))
  }

  clear() {
    this.entries.clear()
    this.modules.clear()
    this.sandbox = {}
  }

  async preload() {
    const resolved = await readFilesystem(this.path, this.recursive, true)
    this.entries = new Map(Object.entries(resolved))
  }

  async load() {
    for (const [name, path] of this.entries) {
      // Skip already loaded dependencies
      if (!this.modules.has(name)) await this.loadModule(name, path)
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
        for (const [hookname, hookSet] of Object.entries(hooks)) {
          if (Array.isArray(this.hooks) && !this.hooks.includes(hookname))
            continue
          if (this.application.hooks.has(hookname)) {
            for (const hook of hookSet) {
              if (isAsyncFunction(hook)) {
                this.application.hooks.get(hookname).add(hook)
              } else if (hook) {
                throw new Error(
                  `Hook ${hookname} must be type of async function`
                )
              }
            }
          }
        }
      }

      const transformed = await this.transform(
        exports,
        moduleName,
        filePath.replace(this.path, '').slice(1)
      )

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
  SEPARATOR,
}
