import { randomBytes } from 'node:crypto'
import { FSWatcher, watch } from 'node:fs'

export const createRandomToken = (
  length = 32,
  encoding: BufferEncoding = 'base64url'
): string => randomBytes(length).toString(encoding)

export const camelize = (str: string): string =>
  str
    .replace(/^([A-Z])|[\s-_]+(\w)/g, (match, p1, p2, offset) =>
      p2 ? p2.toUpperCase() : p1.toLowerCase()
    )
    .replace(/(?![A-Za-z0-9])./g, '')

export const createWatcher = (
  path: string,
  options: { timeout: number; recursive?: boolean }
): FSWatcher => {
  const { timeout, recursive } = options
  let timer: NodeJS.Timeout
  const changes = new Map<string, string>()
  const watcher = watch(path, { recursive })
  watcher.on('change', (event, filename) => {
    const file = typeof filename === 'string' ? filename : filename.toString()
    changes.set(file, event)
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      watcher.emit('changes', changes)
      changes.clear()
    }, timeout)
  })
  return watcher
}

export const unique = <T>(
  collection: Iterable<T>,
  keyFn?: (item: T) => any
): T[] => {
  const keys = new Set()
  const result = []
  for (const item of collection) {
    const key = keyFn?.(item) ?? item
    if (!keys.has(key)) {
      keys.add(key)
      result.push(item)
    }
  }
  return result
}

export const getGroupFromRegex = (
  input: string,
  regex: RegExp,
  group: string
): string | undefined => {
  const matches = Array.from(input.matchAll(regex))
  const match = matches[0]
  return match?.groups?.[group]
}
