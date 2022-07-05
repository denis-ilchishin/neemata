class Cache {
  constructor(application) {
    this.client = application.redis.client
  }

  async get(key, _default = null) {
    return JSON.parse(await this.client.get(key))
  }

  set(key, value) {
    return this.client.set(key, JSON.stringify(value))
  }

  delete() {}

  exists() {}
}

module.exports = {
  Cache,
}
