import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { FSWatcher, watch } from 'node:fs'
import { isBuiltin } from 'node:module'
import { delimiter } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { MessagePort } from 'node:worker_threads'

let port: MessagePort
let hrtime = process.hrtime.bigint()
const watchers = new Map<string, FSWatcher>()
const cwd = process.cwd()

async function isIgnored(path) {
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

function onChange() {
  hrtime = process.hrtime.bigint()
  console.log('restart')
  port.postMessage('restart')
}

process.once('beforeExit', () => {
  for (const watcher of watchers.values()) {
    watcher.close()
  }
})

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

export function fileUrl(val: string) {
  try {
    return new URL(val)
  } catch (error) {
    return pathToFileURL(val)
  }
}

export function isLib(val: URL) {
  return (
    isBuiltin(val.toString()) || ![delimiter, '.'].includes(val.pathname[0])
  )
}

export async function load(url, context, nextLoad) {
  url = fileUrl(url)

  // Take a resolved URL and return the source code to be evaluated.
  if (!isLib(url) && !(await isIgnored(fileURLToPath(url)))) {
    const watcher = watch(fileURLToPath(url), { persistent: false }, onChange)
    watchers.set(url, watcher)
  }

  if (!isLib(url)) {
    url.searchParams.set('t', hrtime.toString())
  }

  const res = await nextLoad(url.toString(), context)

  return res
}
