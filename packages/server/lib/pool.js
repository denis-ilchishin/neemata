/**
 * @typedef {Object} PoolOptions
 * @property {number} [timeout=0]
 */

/**
 * @typedef {Object} Waiting
 * @property {Function} resolve
 * @property {number|null} timer
 */

/**
 * @template {any} T
 * @typedef {Object} Pool
 * @property {Function} add
 * @property {Function} capture
 * @property {Function} release
 * @property {Function} isFree
 * @property {Function} next
 * @property {Set<T>} items
 * @property {Set<T>} free
 * @property {Array<Waiting>} queue
 */

/**
 * @template {any} T
 * @param {number} size
 * @param {PoolOptions} [options]
 * @returns {Pool<T>}
 */
export const createPool = (size, options = {}) => {
  const timeout = options.timeout || 0
  const items = new Set()
  const free = new Set()
  const queue = []

  const next = async (timeout = options.timeout) => {
    if (items.size === 0) throw new Error('Pool: pool is empty')
    if (free.size === 0) {
      return new Promise((resolve, reject) => {
        const waiting = { resolve, timer: null }
        waiting.timer = timeout
          ? setTimeout(() => {
              waiting.resolve = null
              queue.shift()
              reject(new Error('Pool: pull item timeout'))
            }, timeout)
          : null
        queue.push(waiting)
      })
    }

    return free.values().next().value
  }

  const add = (item) => {
    if (items.has(item)) throw new Error('Pool: item already in pool')
    items.add(item)
    free.add(item)
  }

  const capture = async (timeout = options.timeout) => {
    const item = await next(timeout)
    free.delete(item)
    return item
  }

  const release = (item) => {
    if (!items.has(item)) throw new Error('Pool: release unexpected item')
    if (free.has(item)) throw new Error('Pool: release not captured')
    free.add(item)
    if (queue.length > 0) {
      const { resolve, timer } = queue.shift()
      clearTimeout(timer)
      if (resolve) resolve(item)
    }
  }

  const isFree = (item) => {
    return free.has(item)
  }

  return { add, capture, release, isFree, next, items, free, queue }
}
