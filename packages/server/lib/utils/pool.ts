interface PoolOptions {
  timeout?: number
}

interface QueueItem {
  resolve: Function
  timer: NodeJS.Timer | null
}

export class PoolError extends Error {}

export class Pool<T = unknown> {
  #items: Set<T>
  #free: Set<T>

  private defaultTimeout: number
  private queue: QueueItem[]

  constructor(options: PoolOptions = {}) {
    this.defaultTimeout = options.timeout || 0
    this.#items = new Set<T>()
    this.#free = new Set<T>()
    this.queue = []
  }

  private async next(timeout = this.defaultTimeout) {
    if (this.#items.size === 0) throw new PoolError('Pool is empty')
    if (this.#free.size === 0) {
      return new Promise((resolve, reject) => {
        const waiting: QueueItem = { resolve, timer: null }
        waiting.timer = timeout
          ? setTimeout(() => {
              waiting.resolve = null
              this.queue.shift()
              reject(new PoolError('pull item timeout'))
            }, timeout)
          : null
        this.queue.push(waiting)
      })
    }
    return this.#free.values().next().value
  }

  public add(item: T): void {
    if (typeof item === 'undefined' || item === null)
      throw new PoolError('Item is undefined or null')
    if (this.#items.has(item)) throw new PoolError('Item is already in pool')
    this.#items.add(item)
    this.#free.add(item)
  }

  public async capture(timeout = this.defaultTimeout) {
    const item = await this.next(timeout)
    this.#free.delete(item)
    return item
  }

  public release(item: T): void {
    if (!this.#items.has(item)) throw new PoolError('Release unexpected item')
    if (this.#free.has(item)) throw new PoolError('Release not captured item')
    this.#free.add(item)
    if (this.queue.length > 0) {
      const { resolve, timer } = this.queue.shift()!
      clearTimeout(timer)
      if (resolve) resolve(item)
    }
  }

  public isFree(item: T): boolean {
    return this.#free.has(item)
  }

  public remove(item: T): void {
    if (!this.#items.has(item)) throw new PoolError('Remove unexpected item')
    this.#free.delete(item)
    this.#items.delete(item)
  }

  public get items() {
    return Array.from(this.#items)
  }

  public get free() {
    return Array.from(this.#free)
  }
}
