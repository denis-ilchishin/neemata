import { randomBytes } from 'node:crypto'
import { watch } from 'node:fs'

/**
 * @param {number} length
 * @param {BufferEncoding} encoding
 * @returns {string}
 */
export const createRandomToken = (length = 32, encoding = 'base64url') =>
  randomBytes(length).toString(encoding)

/**
 * @param {string} str
 * @returns {string}
 */
export const camelize = (str) =>
  str
    .replace(/^([A-Z])|[\s-_]+(\w)/g, (match, p1, p2, offset) =>
      p2 ? p2.toUpperCase() : p1.toLowerCase()
    )
    .replace(/(?![A-Za-z0-9])./g, '')

/**
 * @param {string} path
 * @param {{timeout: number, recursive?: boolean}} options
 * @returns {import('node:fs').FSWatcher}
 */
export const createWatcher = (path, options) => {
  const { timeout, recursive } = options
  let timer
  const changes = new Map()
  const watcher = watch(path, { recursive })
  watcher.on('change', (event, filename) => {
    const file = typeof filename === 'string' ? filename : filename.toString()
    changes.set(file, event)
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      watcher.emit('reload', changes)
      changes.clear()
    }, timeout)
  })
  return watcher
}

/**
 * @template T
 * @param {Iterable<T>} collection
 * @param {(item: T) => any} [keyFn]
 * @returns {T[]}
 */
export const unique = (collection, keyFn) => {
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

/**
 * @param {string} input
 * @param {RegExp} regex
 * @param {string} group
 */
export const getGroupFromRegex = (input, regex, group) => {
  const matches = Array.from(input.matchAll(regex))
  const match = matches[0]
  return match?.groups?.[group]
}

const markAs = (value, mark) => {
  value[mark] = true
  return value
}

export const PROCEDURE_SYMBOL = Symbol('procedure')
export const PROVIDER_SYMBOL = Symbol('provider')
export const CONTEXT_SYMBOL = Symbol('context')
export const APPLICATION_SYMBOL = Symbol('app')

/** @type {import('../types').DefineProcedure} */
export const defineProcedure = (value) => markAs(value, PROCEDURE_SYMBOL)

/** @type {import('../types').DefineProvider} */
export const defineProvider = (value) => markAs(value, PROVIDER_SYMBOL)

/** @type {import('../types').DefineContext} */
export const defineContext = (value) => markAs(value, CONTEXT_SYMBOL)
