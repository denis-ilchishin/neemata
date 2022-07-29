// require('redis').createClient().get()
class Cache {
  #client

  constructor(application) {
    this.#client = application.redis.client
  }

  async get(key, _default = null) {
    const value = await this.#client.get(key)
    return value ? JSON.parse(value) : _default
  }

  async set(key, value, ttl = null) {
    await this.#client.set(key, JSON.stringify(value), { PX: ttl ?? 0 })
  }

  async delete(key) {
    await this.#client.del(key)
  }

  async exists(key) {
    return !!(await this.#client.exists(key))
  }

  async ttl(key) {
    if (await this.exists(key)) {
      const ttl = await this.#client.pTtl(key)
      if (ttl >= 0) return ttl
    }
    return 0
  }
}

module.exports = {
  Cache,
}
