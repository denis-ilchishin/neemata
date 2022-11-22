'use strict'

const Zod = require('zod')
const { deepMerge } = require('./utils')
const { Watcher } = require('./watcher')

const schema = Zod.object({
  workers: Zod.number().int().min(1),
  ports: Zod.array(Zod.number().int().min(2).max(65535)).min(1),
  api: Zod.object({
    baseUrl: Zod.string().startsWith('/'),
    hostname: Zod.string(),
    cors: Zod.any().optional(),
    multipart: Zod.any().optional(),
  }),
  log: Zod.object({
    basePath: Zod.string(),
    level: Zod.enum(['debug', 'info', 'warn', 'error']),
  }),
  auth: Zod.object({
    service: Zod.string(),
  }),
  timeouts: Zod.object({
    startup: Zod.number().int().min(0),
    shutdown: Zod.number().int().min(0),
    hrm: Zod.number().int().min(0),
    request: Zod.number().int().min(0),
    task: Zod.object({
      execution: Zod.number().int().min(0),
      allocation: Zod.number().int().min(0),
    }),
  }),
  intervals: Zod.object({
    ping: Zod.number().int().min(0),
  }),
  scheduler: Zod.object({
    tasks: Zod.array(
      Zod.object({
        name: Zod.string(),
        task: Zod.string(),
        cron: Zod.string(),
        timeout: Zod.number().int().min(0),
        args: Zod.array(Zod.any()).default(() => []),
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
   * @type {import('../types/neemata').NeemataConfig}
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
      const parsed = schema.safeParse(
        deepMerge(defaultConfig, require(this.path))
      )
      if (parsed.success) this.resolved = parsed.data
      else throw parsed.error
    } catch (error) {
      console.error(error)
    }
  }
}

module.exports = { Config }
