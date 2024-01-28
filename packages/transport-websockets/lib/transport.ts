import { BaseTransport } from '@neematajs/application'
import { WebsocketsTransportServer } from './server'
import {
  HttpTransportApplicationContext,
  HttpTransportData,
  WebsocketsTransportApplicationContext,
  WebsocketsTransportData,
  WebsocketsTransportOptions,
} from './types'

export class WebsocketsTransport<
  Options extends WebsocketsTransportOptions = WebsocketsTransportOptions,
> extends BaseTransport<
  HttpTransportApplicationContext & WebsocketsTransportApplicationContext,
  HttpTransportData | WebsocketsTransportData
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
