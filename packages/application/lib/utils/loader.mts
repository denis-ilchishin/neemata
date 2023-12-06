import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { FSWatcher, watch } from 'node:fs'
import { isBuiltin } from 'node:module'
import { sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { MessagePort } from 'node:worker_threads'
import { debounce } from './functions.js'

let port: MessagePort
let tsmp = Date.now()
const watchers = new Map<string, FSWatcher>()
const cwd = process.cwd()

async function checkIgnore(path) {
  if (
    !path.startsWith(cwd) ||
    path.includes('/node_modules/') ||
    path.includes('/dist/') ||
    watchers.has(path) ||
    Array.from(watchers.keys()).some((p) => path.startsWith(p))
  )
    return true

  path = path.slice(cwd.length + 1)
  const gitCheck = spawn('git', ['check-ignore'])
  const stdout = []
  gitCheck.stdout.on('data', (data) => stdout.push(data))
  await once(gitCheck, 'exit')
  const result = Buffer.from(stdout).toString()
  return result === path
}

const onChange = debounce(() => {
  tsmp = Date.now()
  port.postMessage('restart')
}, 250)

export async function initialize(data) {
  port = data.port
  for (const path of data.paths ?? []) {
    if (!path) continue
    const watcher = watch(
      path,
      { persistent: false, recursive: true },
      onChange
    )
    watchers.set(path, watcher)
  }
}

export function fileUrl(val: string | URL, parentURL?: string | URL) {
  if (val instanceof URL) return val
  try {
    return new URL(val, parentURL)
  } catch (error) {
    return pathToFileURL(val)
  }
}

export function isLib(val: URL | string) {
  const isPath = (path: string) => [sep, '.'].includes(path[0])

  if (val instanceof URL) {
    return val.protocol === 'file:'
  } else {
    if (isBuiltin(val)) return true
    else if (val.startsWith('file:')) return false
    return !isPath(val)
  }
}

export async function resolve(specifier, context, nextResolve) {
  if (!isLib(specifier)) {
    const url = fileUrl(specifier, context.parentURL)
    url.searchParams.set('t', `${tsmp}`)
    specifier = `${url}`
  }
  return nextResolve(specifier, context)
}

export async function load(specifier, context, nextLoad) {
  if (!isLib(specifier)) {
    const url = fileUrl(specifier, context.parentURL)
    url.searchParams.delete('t')
    const pathToWatch = fileURLToPath(url)
    const ignored = await checkIgnore(pathToWatch)
    if (!ignored) {
      const watcher = watch(pathToWatch, { persistent: false }, onChange)
      watchers.set(pathToWatch, watcher)
    }
  }
  return nextLoad(specifier, context)
}
