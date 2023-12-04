import { Callback, Pattern } from '../types'

export const merge = (...objects: Object[]) => Object.assign({}, ...objects)

export const defer = <T extends Callback>(
  cb: T,
  ms = 1
): Promise<Awaited<ReturnType<T>>> =>
  new Promise((resolve, reject) =>
    setTimeout(async () => {
      try {
        resolve(await cb())
      } catch (error) {
        reject(error)
      }
    }, ms)
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

export const importDefault = (specifier: string) =>
  import(specifier).then((m) => m.default)

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
