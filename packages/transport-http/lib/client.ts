import { BaseClient } from '@neemata/application'
import { HttpTransportClientContext, HttpTransportProtocol } from './types'

export class HttpTransportClient<Data = any> implements BaseClient<Data> {
  readonly id: string
  readonly protocol = HttpTransportProtocol.Http

  #context: HttpTransportClientContext

  constructor(context: HttpTransportClientContext, public readonly data: Data) {
    this.#context = context
    this.id = context.id
  }

  send() {
    // HTTP transport doesn't support bi-directional communitcation,
    // so just ignore and return false
    return false
  }

  setHeader(key: string, value: string) {
    this.#context.setResponseHeader(key, value)
  }
}
