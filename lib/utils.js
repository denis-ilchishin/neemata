function deepMerge(...objs) {
  const [first, ...other] = objs
  const final = { ...first }
  for (const obj of other) {
    for (const [key, value] of Object.entries(obj)) {
      const isObj =
        typeof final[key] === 'object' &&
        typeof value === 'object' &&
        !Array.isArray(final[key]) &&
        !Array.isArray(value)
      if (isObj) final[key] = deepMerge(final[key], value)
      else final[key] = value
    }
  }
  return final
}

const versioning = {
  satisfy: (source, target) => {
    const parse = (ver) => ver.split('.').filter((v) => v)

    if (target === '*') return true

    source = parse(source).map((v) => parseInt(v))
    target = parse(target)

    if (
      target
        .filter((v) => v !== '*')
        .map((v) => parseInt(v))
        .findIndex((v) => Number.isNaN(v)) !== -1
    )
      return false

    for (let i = 0; i < Math.min(source.length, target.length); i++) {
      const v = source[i]
      let r = target[i]

      if (r === '*') return true
      r = parseInt(r)
      if (v > r) return false
      else if (r > v) return true
    }

    return target.length >= source.length
  },
  sort:
    (cb, desc = true) =>
    (a, b) =>
      cb(b) < cb(a) ? (desc ? -1 : 1) : desc ? 1 : -1,
}

module.exports = { deepMerge, versioning }
