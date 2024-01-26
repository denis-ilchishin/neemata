import { watch } from 'node:fs'
import { isBuiltin } from 'node:module'
import { sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/** @type {import('node:worker_threads').MessagePort} */
let port
let tsmp = Date.now()

/** @type {Map<string, import('node:fs').FSWatcher>} */
const watchers = new Map()
const cwd = process.cwd()

const isRelativePath = (path) => path.startsWith('.')
const isFileUrl = (path) => path.startsWith('file://')

async function isIgnored(path) {
  if (
    !path.startsWith(cwd) ||
    path.includes('/node_modules/') ||
    path.includes('/dist/') ||
    watchers.has(path) ||
    Array.from(watchers.keys()).some((p) => path.startsWith(p))
  )
    return true
}

const onChange = () => {
  tsmp = Date.now()
  port.postMessage('change')
}

export async function initialize(data) {
  port = data.port
  for (const path of data.paths) {
    const watcher = watch(
      path,
      { persistent: false, recursive: true },
      onChange
    )
    watchers.set(path, watcher)
  }
}

export function fileUrl(val, parentURL) {
  if (val instanceof URL) return val
  if (isFileUrl(val)) return new URL(val)
  return isRelativePath(val) ? new URL(val, parentURL) : pathToFileURL(val)
}

export function isLib(val) {
  const isPath = (path) => [sep, '.'].includes(path[0])

  if (val instanceof URL) {
    return val.protocol === 'file:'
  } else {
    if (isBuiltin(val)) return true
    else if (isFileUrl(val)) return false
    return !isPath(val)
  }
}

export async function resolve(specifier, context, nextResolve) {
  const resolved = await nextResolve(`${specifier}`, context)
  if (!isLib(resolved.url)) {
    const url = fileUrl(resolved.url, context.parentURL)
    url.searchParams.set('t', `${tsmp}`)
    return {
      ...resolved,
      url: `${url}`,
    }
  }
  return resolved
}

export async function load(specifier, context, nextLoad) {
  if (!isLib(specifier)) {
    const url = fileUrl(specifier, context.parentURL)
    url.searchParams.delete('t')
    const pathToWatch = fileURLToPath(url)
    const ignored = await isIgnored(pathToWatch)
    if (!ignored) {
      const watcher = watch(pathToWatch, { persistent: false }, onChange)
      watchers.set(pathToWatch, watcher)
    }
  }
  return nextLoad(`${specifier}`, context)
}
