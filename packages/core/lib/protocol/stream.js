'use strict'

const { Duplex } = require('node:stream')

class Stream extends Duplex {
  constructor({ client, id, size, type, name }) {
    super({
      allowHalfOpen: false,
    })

    this.id = id
    this.meta = {
      size,
      type,
      name,
    }

    this.client = client
  }

  _read() {}

  _write(chunk, encoding, callback) {
    this.push(chunk, encoding)
    callback()
  }

  _pull() {
    this.client.send('neemata:stream:pull', {
      id: this.id,
    })
    return this
  }

  pipe(...args) {
    const stream = super.pipe(...args)
    this._pull()
    return stream
  }

  done() {
    return new Promise((res, rej) => {
      this.once('end', () => res())
      this.once('error', (err) => rej(err))
    })
  }

  toBuffer() {
    return new Promise((res, rej) => {
      const chunks = []
      this.on('data', (chunk) => chunks.push(chunk))
      this.on('end', () => res(Buffer.concat(chunks)))
      this.on('error', (err) => rej(err))
      this._pull()
    })
  }
}

module.exports = { Stream }
