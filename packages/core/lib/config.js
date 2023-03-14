'use strict'

const { Type } = require('@sinclair/typebox')
const { Value } = require('@sinclair/typebox/value')
const { deepMerge } = require('./utils/functions')
const { Watcher } = require('./utils/watcher')

const schema = Type.Object({
  workers: Type.Number({ minimum: 1 }),
  ports: Type.Array(Type.Number({ minimum: 1, maximum: 65535 }), {
    minItems: 1,
  }),
  api: Type.Object({
    hostname: Type.String(),
    cors: Type.Optional(Type.Object({ origin: Type.String() })),
    queue: Type.Object({
      concurrency: Type.Integer(),
      size: Type.Integer(),
    }),
    auth: Type.Object({
      service: Type.String(),
    }),
    schema: Type.Union(['zod', 'typebox'].map((v) => Type.Literal(v))),
  }),
  log: Type.Object({
    basePath: Type.String(),
    level: Type.Union(
      ['debug', 'info', 'warn', 'error'].map((v) => Type.Literal(v))
    ),
  }),
  timeouts: Type.Object({
    startup: Type.Integer({ minimum: 0 }),
    shutdown: Type.Integer({ minimum: 0 }),
    hmr: Type.Integer({ minimum: 0 }),
    task: Type.Object({
      execution: Type.Integer({ minimum: 0 }),
      allocation: Type.Integer({ minimum: 0 }),
    }),
    rpc: Type.Object({
      execution: Type.Integer({ minimum: 0 }),
      queue: Type.Integer({ minimum: 0 }),
    }),
  }),
  intervals: Type.Object({
    ping: Type.Integer({ minimum: 0 }),
  }),
  scheduler: Type.Object({
    tasks: Type.Array(
      Type.Object({
        name: Type.String(),
        task: Type.String(),
        cron: Type.String(),
        timeout: Type.Integer({ minimum: 0 }),
        args: Type.Array(Type.Any(), { default: [] }),
      })
    ),
  }),
})

const defaultConfig = {
  api: {
    cors: {
      origin: '*',
    },
    hostname: '0.0.0.0',
    queue: {
      concurrency: 200,
      size: 1000,
    },
    auth: {
      service: 'auth/api',
    },
    schema: 'zod',
  },
  log: { basePath: 'logs', level: 'info' },
  timeouts: {
    hmr: 250,
    // request: 5000,
    shutdown: 10000,
    startup: 10000,
    task: {
      allocation: 30000,
      execution: 15000,
    },
    rpc: {
      execution: 10000,
      queue: 30000,
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
