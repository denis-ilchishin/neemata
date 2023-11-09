export type Pattern = RegExp | string | ((name: string) => boolean)
export const match = (name: string, pattern: Pattern) => {
  if (typeof pattern === 'function') {
    return pattern(name)
  } else if (typeof pattern === 'string') {
    if (pattern === '*' || pattern === '**') {
      return true
    } else if (pattern.startsWith('*') && pattern.endsWith('*')) {
      return name.includes(pattern.slice(1, -1))
    } else if (pattern.endsWith('*')) {
      return name.startsWith(pattern.slice(0, -1))
    } else if (pattern.startsWith('*')) {
      return name.endsWith(pattern.slice(1))
    } else {
      return name === pattern
    }
  } else {
    return pattern.test(name)
  }
}

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
  #current: Iterator<T>

  private defaultTimeout: number
  private queue: QueueItem[]

  constructor(options: PoolOptions = {}) {
    this.defaultTimeout = options.timeout || 0
    this.#items = new Set<T>()
    this.#free = new Set<T>()
    this.#current = this.#free.values()
    this.queue = []
  }

  async next(timeout = this.defaultTimeout): Promise<T> {
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
    return this.getNextFree()
  }

  private getNextFree() {
    //TODO: maybe just better use indexed array instead of set here??
    const { value, done } = this.#current.next()
    if (done) {
      this.#current = this.#free.values()
      return this.getNextFree()
    }
    return value
  }

  public add(item: T): void {
    if (typeof item === 'undefined' || item === null)
      throw new PoolError('Item is undefined or null')
    if (this.#items.has(item)) throw new PoolError('Item is already in pool')
    this.#items.add(item)
    this.#free.add(item)
  }

  public async capture(timeout = this.defaultTimeout): Promise<T> {
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

interface SemaphoreQueueItem {
  resolve: ((value: any) => any) | null
  timer: null | NodeJS.Timeout
}

export class SemaphoreError extends Error {}

export class Semaphore {
  private counter: number

  private readonly queue: SemaphoreQueueItem[] = []

  constructor(
    private readonly concurrency: number,
    private readonly size: number = 0,
    private readonly timeout: number = 0
  ) {
    this.counter = concurrency
  }

  enter(): Promise<void> {
    if (this.counter > 0) {
      this.counter--
      return Promise.resolve()
    } else if (this.queue.length >= this.size) {
      return Promise.reject(new SemaphoreError('Semaphore queue is full'))
    } else {
      return new Promise((resolve, reject) => {
        const waiting: SemaphoreQueueItem = { resolve, timer: null }
        waiting.timer = setTimeout(() => {
          waiting.resolve = null
          this.queue.shift()
          reject(new SemaphoreError('Semaphore timeout'))
        }, this.timeout)
        this.queue.push(waiting)
      })
    }
  }

  leave() {
    if (this.queue.length === 0) {
      this.counter++
    } else {
      const item = this.queue.shift()
      if (item) {
        const { resolve, timer } = item
        if (timer) clearTimeout(timer)
        if (resolve) setTimeout(resolve, 0)
      }
    }
  }

  get isEmpty() {
    return this.queue.length === 0
  }

  get queueLength() {
    return this.queue.length
  }
}
