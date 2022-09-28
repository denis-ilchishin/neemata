export class Cache {
  get: <T = any>(key: string, _default?: T) => Promise<T>
  set: (key: string, value: any, ttl?: number) => Promise<void>
  delete: (key: string) => Promise<void>
  exists: (key: string) => Promise<boolean>
  ttl: (key: string) => Promise<number>
}
