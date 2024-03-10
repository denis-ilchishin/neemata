import type { Callback, Pattern } from '../types'

export const merge = (...objects: object[]) => Object.assign({}, ...objects)

export const defer = <T extends Callback>(
  cb: T,
  ms = 1,
  ...args: Parameters<T>
): Promise<Awaited<ReturnType<T>>> =>
  new Promise((resolve, reject) =>
    setTimeout(async () => {
      try {
        resolve(await cb(...args))
      } catch (error) {
        reject(error)
      }
    }, ms),
  )

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

export const importDefault = (specifier: any) =>
  import(`${specifier}`).then((m) => m.default)

export const range = (count: number, start = 0) => {
  let current = start
  return {
    [Symbol.iterator]() {
      return {
        next() {
          if (current < count) {
            return { done: false, value: current++ }
          } else {
            return { done: true, value: current }
          }
        },
      }
    },
  }
}

export const debounce = (cb: Callback, delay: number) => {
  let timer: ReturnType<typeof setTimeout>
  const clear = () => timer && clearTimeout(timer)
  const fn = (...args: any[]) => {
    clear()
    timer = setTimeout(cb, delay, ...args)
  }
  return Object.assign(fn, { clear })
}

export const isJsFile = (name: string) => {
  if (name.endsWith('.d.ts')) return false
  const leading = name.split('.').slice(1)
  const ext = leading.join('.')
  return ['js', 'mjs', 'cjs', 'ts', 'mts', 'cts'].includes(ext)
}

export type Future<T> = {
  resolve: (value: T) => void
  reject: (error?: any) => void
  promise: Promise<T>
  toArgs: () => [resolve: (value: T) => void, reject: (error: any) => void]
}

// TODO: Promise.withResolvers?
export const createFuture = <T>(): Future<T> => {
  let resolve: Callback
  let reject: Callback
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  const toArgs = () => [resolve, reject]
  // @ts-expect-error
  return { resolve, reject, promise, toArgs }
}

export const onAbort = <T extends Callback>(
  signal: AbortSignal,
  cb: T,
  reason?: any,
) => {
  const listener = () => cb(reason ?? signal.reason)
  signal.addEventListener('abort', listener, { once: true })
  return () => signal.removeEventListener('abort', listener)
}

export const noop = () => {}
