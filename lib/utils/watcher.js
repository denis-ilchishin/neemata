const EventEmitter = require('events')
const { watch } = require('fs')

class Watcher extends EventEmitter {
  constructor({ path, timeout, recursive }) {
    super()
    this.path = path
    this.timeout = timeout || 2000
    this.recursive = recursive
  }

  watch() {
    this.ac = new AbortController()

    let _timeout = null
    let files = []
    watch(
      this.path,
      { recursive: this.recursive, signal: this.ac.signal },
      (eventType, filename) => {
        if (!files.includes(filename)) files.push(filename)
        if (_timeout) clearTimeout(_timeout)
        _timeout = setTimeout(() => {
          this.emit('change', [...files])
          files = []
        }, this.timeout)
      }
    )
  }

  abort() {
    this.ac.abort()
  }
}

module.exports = {
  Watcher,
}
