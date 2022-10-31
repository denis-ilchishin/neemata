export class Pool<T = any> {
  constructor(options?: { timeout?: number })

  size: number
  available: numebr
  items: Set<T>

  next(timeout?: number): Promise<T>
  add(item: T): void
  remove(item: T): void
  capture(): Promise<T>
  release(item: T): void
  isFree(item: T): boolean
}
