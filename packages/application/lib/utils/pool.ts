import type { Callback } from '../types'

interface PoolOptions {
  timeout?: number
}

interface PoolQueueItem {
  resolve?: Callback
  timer?: ReturnType<typeof setTimeout>
}

export class PoolError extends Error {}

// Fixed pool from https://github.com/metarhia/metautil
export class Pool<T = unknown> {
  #items: Array<T> = []
  #free: Array<boolean> = []
  #queue: PoolQueueItem[] = []
  #current: number = 0
  #size: number = 0
  #available: number = 0

  constructor(private readonly options: PoolOptions = {}) {}

  add(item: T) {
    if (this.#items.includes(item)) throw new PoolError('Item already exists')
    this.#size++
    this.#available++
    this.#items.push(item)
    this.#free.push(true)
  }

  remove(item: T) {
    if (this.#size === 0) throw new PoolError('Pool is empty')
    const index = this.#items.indexOf(item)
    if (index < 0) throw new PoolError('Item is not in the pool')
    const isCaptured = this.isFree(item)
    if (isCaptured) this.#available--
    this.#size--
    this.#current--
    this.#items.splice(index, 1)
    this.#free.splice(index, 1)
  }

  capture(timeout = this.options.timeout) {
    return this.next(true, timeout)
  }

  async next(exclusive = false, timeout = this.options.timeout): Promise<T> {
    if (this.#size === 0) throw new PoolError('Pool is empty')
    if (this.#available === 0) {
      return new Promise((resolve, reject) => {
        const waiting: PoolQueueItem = {
          resolve: (item: T) => {
            if (exclusive) this.#capture(item)
            resolve(item)
          },
          timer: undefined,
        }
        if (timeout) {
          waiting.timer = setTimeout(() => {
            waiting.resolve = undefined
            this.#queue.shift()
            reject(new PoolError('Next item timeout'))
          }, timeout)
        }
        this.#queue.push(waiting)
      })
    }
    let item: T | undefined = undefined
    let free = false
    do {
      item = this.#items[this.#current]
      free = this.#free[this.#current]
      this.#current++
      if (this.#current >= this.#size) this.#current = 0
    } while (typeof item === 'undefined' || !free)
    if (exclusive) this.#capture(item)
    return item
  }

  release(item: T) {
    const index = this.#items.indexOf(item)
    if (index < 0) throw new PoolError('Unexpected item')
    if (this.#free[index])
      throw new PoolError('Unable to release not captured item')
    this.#free[index] = true
    this.#available++
    if (this.#queue.length > 0) {
      const { resolve, timer } = this.#queue.shift()!
      clearTimeout(timer)
      if (resolve) setTimeout(resolve, 0, item)
    }
  }

  isFree(item: T) {
    const index = this.#items.indexOf(item)
    if (index < 0) return false
    return this.#free[index]
  }

  get items() {
    return [...this.#items]
  }

  #capture(item: T) {
    const index = this.#items.indexOf(item)
    this.#free[index] = false
    this.#available--
  }
}
