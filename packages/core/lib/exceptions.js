class ApiException extends globalThis.Error {
  constructor({ code, message, data }) {
    super(message)
    this.code = code
    this.data = data
  }
}

module.exports = { ApiException }
