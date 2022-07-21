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
    const handler = () => {
      this.off(name, handler)
      cb()
    }

    this.on(name, handler)
  }

  emit(name, ...args) {
    const events = this.#on.get(name)
    if (events) {
      for (const cb of events.values()) {
        cb(...args)
      }
    }
  }
}
