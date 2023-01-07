'use strict'

const { Type } = require('@sinclair/typebox')
const { Value } = require('@sinclair/typebox/value')
const { deepMerge } = require('./utils')
const { Watcher } = require('./watcher')

const schema = Type.Object({
  workers: Type.Number({ minimum: 1 }),
  ports: Type.Array(Type.Number({ minimum: 1, maximum: 65535 }), {
    minItems: 1,
  }),
  api: Type.Object({
    baseUrl: Type.String(),
    hostname: Type.String(),
    cors: Type.Optional(Type.Any()),
    multipart: Type.Optional(Type.Any()),
  }),
  log: Type.Object({
    basePath: Type.String(),
    level: Type.Enum(['debug', 'info', 'warn', 'error']),
  }),
  auth: Type.Object({
    service: Type.String(),
  }),
  timeouts: Type.Object({
    startup: Type.Number({ minimum: 0 }),
    shutdown: Type.Number({ minimum: 0 }),
  }),
  intervals: Type.Object({
    ping: Type.Number({ minimum: 0 }),
  }),
  scheduler: Type.Object({
    tasks: Type.Array(
      Type.Object({
        name: Type.String(),
        task: Type.String(),
        cron: Type.String(),
        timeout: Type.Number({ minimum: 0 }),
        args: Type.Array(Type.Any(), { default: [] }),
      })
    ),
  }),
})

const defaultConfig = {
  api: {
    baseUrl: '/api',
    cors: {
      origin: '*',
    },
    hostname: '0.0.0.0',
  },
  auth: {
    service: 'auth.api',
  },
  log: { basePath: 'logs', level: 'info' },
  timeouts: {
    hrm: 250,
    request: 5000,
    shutdown: 10000,
    startup: 10000,
    task: {
      allocation: 30000,
      execution: 15000,
    },
  },
  intervals: {
    ping: 30000,
  },
  scheduler: {
    tasks: [],
  },
}

class Config extends Watcher {
  /**
   * @type {import('../types/internal').NeemataConfig}
   */
  resolved

  constructor(path) {
    super({ path, timeout: 1000 })

    this.load()
    this.on('changed', () => this.load())
  }

  load() {
    try {
      // Clear require cache before re-import
      delete require.cache[this.path]
      const merged = deepMerge(defaultConfig, require(this.path))
      const errors = [...Value.Errors(schema, merged)]
      if (!errors.length) this.resolved = merged
      else throw errors
    } catch (error) {
      console.error(error)
    }
  }
}

module.exports = { Config }
