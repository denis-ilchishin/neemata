/**
 * @param {number} size
 * @param {number} [defaultTimeout]
 */
export const createPool = (size, defaultTimeout = 0) => {
  const items = []
  const free = []
  const queue = []
  let current = 0
  let available = 0

  const next = async (timeout = defaultTimeout) => {
    if (size === 0) return null
    if (available === 0) {
      return new Promise((resolve, reject) => {
        const waiting = { resolve, timer: null }
        waiting.timer = setTimeout(() => {
          waiting.resolve = null
          queue.shift()
          reject(new Error('Pool next item timeout'))
        }, timeout)
        queue.push(waiting)
      })
    }
    let item = null
    let isFree = false
    do {
      item = items[current]
      isFree = free[current]
      current++
      if (current === size) current = 0
    } while (!item || !isFree)
    return item
  }

  const add = (item) => {
    if (items.includes(item)) throw new Error('Pool: add duplicates')
    size++
    available++
    items.push(item)
    free.push(true)
  }

  const capture = async (timeout) => {
    const item = await next(timeout)
    if (!item) return null
    const index = items.indexOf(item)
    free[index] = false
    available--
    return item
  }

  const release = (item) => {
    const index = items.indexOf(item)
    if (index < 0) throw new Error('Pool: release unexpected item')
    if (free[index]) throw new Error('Pool: release not captured')
    free[index] = true
    available++
    if (queue.length > 0) {
      const { resolve, timer } = queue.shift()
      if (timer) clearTimeout(timer)
      if (resolve) setTimeout(resolve, 0, item)
    }
  }

  const isFree = (item) => {
    const index = items.indexOf(item)
    if (index < 0) return false
    return free[index]
  }

  return { add, capture, release, isFree, next }
}
