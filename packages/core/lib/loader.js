'use strict'

const { existsSync } = require('node:fs')
const fsp = require('node:fs/promises')
const { join, parse, extname, sep, basename } = require('node:path')

const SEPARATOR = '/'

function camelize(str) {
  return str
    .toLowerCase()
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase())
}

async function readFilesystem(root, recursive = false, prefix = false) {
  if (!existsSync(root)) return []
  if (!(await fsp.stat(root)).isDirectory()) return []

  const tree = {}

  const add = (treeLevel, entryName, entryPath, override = true) => {
    if (!override && entryName in treeLevel) return
    treeLevel[entryName] = treeLevel[entryName] ?? {}
    treeLevel[entryName]['index'] = entryPath
  }

  const isSupportedFile = (entryName) => {
    if (entryName.startsWith('.')) return false
    if (!/\.(js|ts|mjs|cjs)/.test(extname(entryName))) return false
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
        if (recursive && entries.length) {
          tree[entryName] = tree[entryName] ?? {}
          await traverse(tree[entryName], entries, level + 1)
        }
      }
    }
    await Promise.all(entries.map(traverseEntry))
  }

  await traverse(tree, await readdir(root))

  const entries = []
  const traverseFlat = (tree, path = '') => {
    for (const [key, value] of Object.entries(tree)) {
      if (key === 'index') {
        const alias = [prefix, ...path.split(sep)].join(SEPARATOR)
        entries.push({
          path: value,
          alias,
          name: camelize(alias),
        })
      } else traverseFlat(value, join(path, key))
    }
  }
  traverseFlat(tree)
  return entries
}

class Loader {
  constructor(path, { recursive = true, logErrors = false } = {}) {
    this.path = path
    this.recursive = recursive
    this.logErrors = logErrors
  }

  async load(prefix) {
    const entries = await readFilesystem(this.path, this.recursive, prefix)
    return Promise.all(
      entries.map(async (entry) => ({
        ...entry,
        exports: await this.loadModule(entry.path),
      }))
    ).then((entries) => entries.filter((entry) => entry.exports !== undefined))
  }

  async loadModule(filePath) {
    try {
      const exports = await import(filePath).then(
        (module) => module.default.default
      )
      if (typeof exports === 'undefined') return
      return exports
    } catch (error) {
      if (this.logErrors) {
        logger.warn(`Unable to load the module ${filePath}`)
        logger.error(error)
      }
    }
  }
}

module.exports = {
  Loader,
  readFilesystem,
  SEPARATOR,
}
