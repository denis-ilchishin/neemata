const { createClient } = require('redis')

class Subscriber {
  #application
  #subscriber
  #client

  constructor(application) {
    this.#application = application
    this.#client = createClient({
      ...application.appConfig.redis.subscriber,
    })
    this.#subscriber = this.#client.duplicate()
  }

  async _connect() {
    await Promise.all([this.#client.connect(), this.#subscriber.connect()])
  }

  async _disconnect() {
    await Promise.all([this.#client.quit(), this.#subscriber.quit()])
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
    this.#client.publish(event, JSON.stringify(message))
    this.#application.console.debug(
      'Subscriber message emitted: ' + event,
      'Redis'
    )
  }
}

module.exports = {
  Subscriber,
}
