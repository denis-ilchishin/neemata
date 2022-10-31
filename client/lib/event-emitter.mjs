const key = Symbol('events')

export class EventEmitter {
  constructor() {
    this[key] = new Map()
  }

  on(name, cb) {
    let events = this[key].get(name)
    if (!events) {
      events = new Set()
      this[key].set(name, events)
    }
    events.add(cb)
  }

  off(name, cb) {
    const events = this[key].get(name)
    if (events && events.has(cb)) {
      events.delete(cb)
    }
  }

  once(name, cb) {
    const handler = (...args) => {
      this.off(name, handler)
      cb(...args)
    }
    this.on(name, handler)
  }

  emit(name, ...args) {
    const events = this[key].get(name)
    if (events) {
      for (const cb of events.values()) {
        cb(...args)
      }
    }
  }
}
