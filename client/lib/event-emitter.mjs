export class EventEmitter {
  #on = new Map()
  #once = new Map()

  on(name, cb) {
    let events = this.#on.get(name)

    if (!events) {
      events = new Set()
      this.#on.set(name, events)
    }

    events.add(cb)
  }

  off(name, cb) {
    const events = this.#on.get(name)
    if (events && events.has(cb)) {
      events.delete(cb)
    }
  }

  once(name, cb) {
    let events = this.#once.get(name)

    if (!events) {
      events = new Set()
      this.#once.set(name, events)
    }

    events.add(cb)
  }

  emit(name, ...args) {
    {
      const events = this.#once.get(name)
      if (events) {
        for (const cb of events.values()) {
          cb(...args)
          events.delete(cb)
        }
      }
    }

    {
      const events = this.#on.get(name)
      if (events) {
        for (const cb of events.values()) {
          cb(...args)
        }
      }
    }
  }
}
