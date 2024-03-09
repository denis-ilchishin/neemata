import { BaseTransport } from '@neematajs/application'
import {
  HttpTransportConnection,
  WebsocketsTransportConnection,
} from './connection'
import { WebsocketsTransportServer } from './server'
import { WebsocketsTransportOptions } from './types'

export class WebsocketsTransport<
  Options extends WebsocketsTransportOptions = WebsocketsTransportOptions,
> extends BaseTransport<
  HttpTransportConnection | WebsocketsTransportConnection
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
