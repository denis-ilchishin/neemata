const { TypeCompiler } = require('@sinclair/typebox/compiler')
const { Value } = require('@sinclair/typebox/value')

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

function compileSchema(schema) {
  const compiled = TypeCompiler.Compile(schema)
  compiled.Cast = (data) => Value.Cast(schema, data)
  return compiled
}

const isNullish = (val) => typeof val === 'undefined' || val === null

module.exports = { deepMerge, unique, compileSchema, isNullish }
