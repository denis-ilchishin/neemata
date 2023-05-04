'use strict'

const { isNullish } = require('./functions')

class Pool {
  constructor(options = {}) {
    this.items = new Set()
    this.free = new Set()
    this.queue = new Set()
    this.timeout = options.timeout || 0
    this.current = 0
  }

  get size() {
    return this.items.size
  }

  get available() {
    return this.free.size
  }

  async next(timeout = null) {
    timeout = timeout ?? this.timeout
    if (this.size === 0)
      throw new Error('Unable to allocate an item in empty pool')
    if (this.available === 0) {
      return new Promise((resolve, reject) => {
        const queue = { resolve, timer: null }
        queue.timer = timeout
          ? setTimeout(() => {
              queue.resolve = null
              this.queue.delete(queue)
              reject(new Error('Unable to allocate next item, timeout error'))
            }, timeout)
          : null
        this.queue.add(queue)
      })
    }

    const items = Array.from(this.items)
    let item = null

    do {
      const trying = items[this.current]
      if (this.free.has(trying)) item = trying
      if (this.current >= items.length - 1) this.current = 0
      else this.current++
    } while (isNullish(item))

    return item
  }

  add(item, capture = false) {
    if (isNullish(item)) throw new Error('Unable to add nullish item')
    if (this.items.has(item)) throw new Error('Unable to add existing item')
    this.items.add(item)
    if (!capture) this.free.add(item)
    this.unqueue(item)
  }

  remove(item) {
    if (this.items.has(item)) {
      if (this.free.has(item)) {
        this.items.delete(item)
        this.free.delete(item)
      } else throw new Error('Unable to remove captured item')
    } else throw new Error('Unable to remove not existing item')
  }

  async capture() {
    const item = await this.next()
    if (isNullish(item)) throw new Error('Unable to capture an item')
    this.free.delete(item)
    return item
  }

  release(item) {
    if (!this.items.has(item))
      throw new Error('Unable to release not existing item')
    if (!this.free.has(item)) {
      this.free.add(item)
      this.unqueue(item)
    }
  }

  unqueue(item) {
    if (this.queue.size > 0) {
      const queue = Array.from(this.queue).shift()
      this.queue.delete(queue)
      const { resolve, timer } = queue
      if (timer) clearTimeout(timer)
      if (resolve) setTimeout(resolve, 0, item)
    }
  }

  isFree(item) {
    return this.free.has(item)
  }
}

module.exports = { Pool }
