import type { Callback } from '../common'

interface SemaphoreQueueItem {
  resolve?: Callback
  timer?: ReturnType<typeof setTimeout>
}

export class SemaphoreError extends Error {}

// Semaphore from https://github.com/metarhia/metautil
export class Semaphore {
  private counter: number

  private readonly queue: SemaphoreQueueItem[] = []

  constructor(
    private readonly concurrency: number,
    private readonly size: number = 0,
    private readonly timeout: number = 0,
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
        const waiting: SemaphoreQueueItem = { resolve }
        waiting.timer = setTimeout(() => {
          waiting.resolve = undefined
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
