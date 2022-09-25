const EventEmitter = require('node:events')
const { watch } = require('node:fs')

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
    this._watch = watch(
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

  stop() {
    this.ac.abort()
    this._watch.close()
  }
}

module.exports = {
  Watcher,
}
