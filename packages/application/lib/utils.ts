import { Pattern } from './types'

type Callback = (...args: any[]) => any

export const merge = (...objects: Object[]) => Object.assign({}, ...objects)
export const defer = (cb: Callback, ms = 1): void => void setTimeout(cb, ms)
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
