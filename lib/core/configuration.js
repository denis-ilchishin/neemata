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
    // TODO: add configuration validation
    return config
  }
}

module.exports = { Configuration }
