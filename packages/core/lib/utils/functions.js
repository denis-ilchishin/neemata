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

const unique = (arr) => [...new Set(arr)]

const isNullish = (val) => typeof val === 'undefined' || val === null

function capitalize(str) {
  return str[0].toUpperCase() + str.slice(1)
}

module.exports = { deepMerge, unique, isNullish, capitalize }
