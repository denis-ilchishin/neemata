import { BaseTransportConnection } from '@neemata/application'

export class HttpTransportConnection extends BaseTransportConnection {
  send() {
    // HTTP 1 transport doesn't support bi-directional communitcation,
    // so just ignore and return false
    return false
  }
}
