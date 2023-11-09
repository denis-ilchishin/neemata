type Callback = (...args: any[]) => any

export const merge = (...objects: Object[]) => Object.assign({}, ...objects)
export const defer = (cb: Callback, ms = 1): void => void setTimeout(cb, ms)
