import { BaseTransport } from '@neematajs/application'
import type {
  HttpTransportConnection,
  WebsocketsTransportConnection,
} from './connection'
import { WebsocketsTransportServer } from './server'
import type { WebsocketsTransportOptions } from './types'

export class WebsocketsTransport<
  Options extends WebsocketsTransportOptions = WebsocketsTransportOptions,
> extends BaseTransport<
  Options['enableHttp'] extends true
    ? HttpTransportConnection | WebsocketsTransportConnection
    : WebsocketsTransportConnection
> {
  name = 'Websockets Transport'
  server!: WebsocketsTransportServer

  constructor(readonly options: Options) {
    super()
  }

  initialize() {
    this.server = new WebsocketsTransportServer(this, this.application)
  }

  async start() {
    await this.server.start()
  }

  async stop() {
    await this.server.stop()
  }
}
