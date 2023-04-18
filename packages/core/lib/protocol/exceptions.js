'use strict'

class ApiException extends globalThis.Error {
  constructor({ code, message, data = undefined }) {
    super(message)
    this.code = code
    this.data = data
  }
}

module.exports = { ApiException }
