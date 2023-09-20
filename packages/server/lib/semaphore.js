/** @typedef {{resolve: ((value: any) => any) | null, timer: null | NodeJS.Timeout}} SemaphoreQueue */

/**
 * @param {number} concurrency
 * @param {number} [size]
 * @param {number} [timeout]
 */
export const createSemaphore = (concurrency, size = 0, timeout = 0) => {
  /** @type {SemaphoreQueue[]} */
  const queue = []
  let counter = concurrency
  let empty = true

  const enter = async () => {
    return new Promise((resolve, reject) => {
      if (counter > 0) {
        counter--
        empty = false
        return void resolve(void 0)
      }

      if (queue.length >= size)
        return void reject(new SemaphoreError('Semaphore queue is full'))

      /** @type {SemaphoreQueue} */
      const waiting = { resolve, timer: null }
      waiting.timer = setTimeout(() => {
        waiting.resolve = null
        queue.shift()
        empty = queue.length === 0 && counter === concurrency
        reject(new SemaphoreError('Semaphore timeout'))
      }, timeout)
      queue.push(waiting)
      empty = false
    })
  }

  const leave = async () => {
    if (queue.length === 0) {
      counter++
      empty = counter === concurrency
      return void 0
    }
    const item = queue.shift()
    if (item) {
      const { resolve, timer } = item
      if (timer) clearTimeout(timer)
      if (resolve) setTimeout(resolve, 0)
      empty = queue.length === 0 && counter === concurrency
    }
  }

  return { enter, leave }
}

export class SemaphoreError extends Error {}
