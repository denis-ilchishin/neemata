const Joi = require('joi')
const { merge } = require('lodash')
class Configuration {
  constructor(path) {
    this.path = path
  }

  resolve() {
    const defaultConfig = {
      server: { hostname: '0.0.0.0', cors: '*' },
      api: {
        baseUrl: '/api',
      },
      timeouts: {
        app: {
          startup: 10000,
          shutdown: 10000,
        },
        server: {
          startup: 10000,
          shutdown: 7500,
        },
        watch: 250,
        guard: 1500,
        request: 5000,
        task: 15000,
      },
      scheduler: {},
    }

    delete require.cache[require.resolve(this.path)]
    const config = merge(defaultConfig, require(this.path))
    const timeoutSchema = () => Joi.number().integer().min(1)

    const schema = Joi.object({
      ports: Joi.array()
        .min(1)
        .items(Joi.number().min(1).max(65535))
        .default([9000]),
      workers: Joi.number()
        .integer()
        .default(Joi.ref('ports', { adjust: (v) => v.length + 1 }))
        .min(Joi.ref('ports', { adjust: (v) => v.length + 1 })),
      server: Joi.object({
        hostname: Joi.string(),
        cors: Joi.string(),
      }),
      api: Joi.object({
        baseUrl: Joi.string(),
      }),
      redis: Joi.object({
        url: Joi.string(),
      }),
      auth: Joi.object({
        lib: Joi.string(),
      }),
      timeouts: Joi.object({
        app: Joi.object({
          startup: timeoutSchema(),
          shutdown: timeoutSchema(),
        }),
        server: Joi.object({
          startup: timeoutSchema(),
          shutdown: timeoutSchema(),
        }),
        request: timeoutSchema(),
        watch: timeoutSchema(),
        guard: timeoutSchema(),
        task: timeoutSchema(),
      }),
      scheduler: Joi.object({
        tasks: Joi.array()
          .items(
            Joi.object({
              name: Joi.string().required(),
              cron: Joi.string().required(),
              task: Joi.string().required(),
              args: Joi.array().default([]),
            })
          )
          .default([]),
      }).required(),
    })

    const { error, value } = schema.validate(config)

    if (error) throw error

    return value
  }
}

module.exports = { Configuration }
