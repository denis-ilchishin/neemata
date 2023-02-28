'use strict'

const { PassThrough } = require('node:stream')

class Stream extends PassThrough {
  constructor({ client, id, size, type, name }) {
    super({ allowHalfOpen: false })

    this.id = id
    this.meta = { size, type, name }
    this.client = client
    this._pulled = false
  }

  _read() {
    if (this._pulled) return
    this.client.send('neemata/stream/pull', { id: this.id })
    this._pulled = true
  }

  _write(chunk, encoding, callback) {
    this.push(chunk, encoding)
    callback()
  }

  done() {
    if (this.readableEnded) return
    return new Promise((resolve, reject) => {
      this.once('end', resolve)
      this.once('error', reject)
    })
  }

  toBuffer() {
    return new Promise((res, rej) => {
      const chunks = []
      this.on('data', (chunk) => chunks.push(chunk))
      this.once('end', () => res(Buffer.concat(chunks)))
      this.once('error', (err) => rej(err))
      this.read()
    })
  }

  toString() {
    return 'neemata/stream/' + this.id
  }

  toJSON() {
    return this.toString()
  }
}

module.exports = { Stream }
