import { BaseTransportClient } from '@neemata/application'
import { HttpTransportClientContext } from './types'

export class HttpTransportClient extends BaseTransportClient {
  readonly protocol = 'http'

  #context: HttpTransportClientContext

  constructor(context: HttpTransportClientContext, data: any) {
    super(context.id, data, 'http')
    this.#context = context
  }

  _handle() {
    // HTTP transport doesn't support bi-directional communitcation,
    // so just ignore and return false
    return false
  }

  setHeader(key: string, value: string) {
    this.#context.setResponseHeader(key, value)
  }
}
