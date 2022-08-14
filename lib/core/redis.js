const { createClient } = require('redis')

class Redis {
  #application
  #subscriber

  constructor(application) {
    this.#application = application
    this.client = createClient({
      url: application.appConfig.redis.url,
      socket: { keepAlive: false },
    })
    this.#subscriber = this.client.duplicate()
  }

  async connect() {
    await this.client.connect()
    await this.#subscriber.connect()
  }

  async disconnect() {
    await this.#subscriber.quit()
    await this.client.quit()
  }

  on(event, cb) {
    this.#subscriber.subscribe(event, (message) => {
      this.#application.console.debug(
        'Subscriber listener received: ' + event,
        'Redis'
      )
      cb(JSON.parse(message))
    })
    this.#application.console.debug(
      'Subscriber listener added: ' + event,
      'Redis'
    )
  }

  off(event) {
    this.#subscriber.unsubscribe(event)
    this.#application.console.debug(
      'Subscriber listener removed: ' + event,
      'Redis'
    )
  }

  emit(event, message) {
    this.client.publish(event, JSON.stringify(message))
    this.#application.console.debug(
      'Subscriber message emitted: ' + event,
      'Redis'
    )
  }
}

module.exports = {
  Redis,
}
