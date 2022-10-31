'use strict'

const EventEmitter = require('node:events')
const { watch } = require('node:fs/promises')

class Watcher extends EventEmitter {
  constructor({ path, timeout, recursive }) {
    super()
    this.path = path
    this.timeout = timeout || 2000
    this.recursive = recursive
  }

  async watch() {
    this.ac = new AbortController()

    let timeout = null
    let files = []

    this.watcher = watch(this.path, {
      signal: this.ac.signal,
      recursive: this.recursive,
    })

    try {
      for await (const { eventType, filename } of this.watcher) {
        if (!files.find((f) => f.filename === filename))
          files.push({ eventType, filename })

        if (timeout) clearTimeout(timeout)

        timeout = setTimeout(() => {
          this.emit('change', [...files])
          files = []
        }, this.timeout)
      }
    } catch (err) {
      if (err.name === 'AbortError') return
      throw err
    }
  }

  stop() {
    this.ac?.abort()
  }
}

module.exports = {
  Watcher,
}
