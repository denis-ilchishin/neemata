'use strict'

const { deepMerge } = require('./utils/functions')
const { Watcher } = require('./utils/watcher')
const Zod = require('zod')

const schema = Zod.object({
  workers: Zod.number().min(1),
  ports: Zod.array(Zod.number().min(1).max(65535)).min(1),
  api: Zod.object({
    hostname: Zod.string(),
    cors: Zod.object({ origin: Zod.string() }).optional(),
    queue: Zod.object({
      concurrency: Zod.number().int(),
      size: Zod.number().int(),
    }),
    auth: Zod.object({
      service: Zod.string(),
    }),
    schema: Zod.union([Zod.literal('zod'), Zod.literal('zod-format'), Zod.literal('zod-flatten')]),
  }),
  log: Zod.object({
    basePath: Zod.string(),
    level: Zod.enum(['debug', 'info', 'warn', 'error']),
  }),
  timeouts: Zod.object({
    startup: Zod.number().min(0),
    shutdown: Zod.number().min(0),
    hmr: Zod.number().min(0),
    task: Zod.object({
      execution: Zod.number().min(0),
      allocation: Zod.number().min(0),
    }),
    rpc: Zod.object({
      execution: Zod.number().min(0),
      queue: Zod.number().min(0),
    }),
  }),
  intervals: Zod.object({
    ping: Zod.number().min(0),
  }),
  scheduler: Zod.object({
    tasks: Zod.array(
      Zod.object({
        name: Zod.string(),
        task: Zod.string(),
        cron: Zod.string(),
        timeout: Zod.number().min(0),
        args: Zod.array(Zod.any()).default([]),
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
      service: 'auth.api',
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
      this.resolved = schema.parse(merged)
    } catch (error) {
      logger.error(error)
    }
  }
}

module.exports = { Config }
