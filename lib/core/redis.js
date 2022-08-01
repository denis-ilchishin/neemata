const { createClient } = require('redis')

class Redis {
  #application
  #subscriber

  constructor(application) {
    this.#application = application
    this.client = createClient({ url: application.appConfig.redis.url })
    this.#subscriber = this.client.duplicate()
  }

  connect() {
    return Promise.all([this.client.connect(), this.#subscriber.connect()])
  }

  on(event, cb) {
    this.#subscriber.subscribe(event, (message, _event) => {
      this.#application.console.debug(
        'Subscriber listener received: ' + _event,
        'Redis'
      )
      cb(JSON.parse(message), _event)
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
