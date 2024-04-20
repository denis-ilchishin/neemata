import {
  BaseTransport,
  type ExtensionApplication,
} from '@neematajs/application'
import type {
  HttpTransportConnection,
  WebsocketsTransportConnection,
} from './connection'
import { WebsocketsTransportServer } from './server'
import type { WebsocketsTransportOptions } from './types'

export class WebsocketsTransport<
  Options extends WebsocketsTransportOptions = WebsocketsTransportOptions,
> extends BaseTransport<
  HttpTransportConnection | WebsocketsTransportConnection,
  Options
> {
  name = 'Websockets Transport'
  server!: WebsocketsTransportServer

  constructor(application: ExtensionApplication, options: Options) {
    super(application, options)
    this.server = new WebsocketsTransportServer(this, this.application)
  }

  async start() {
    await this.server.start()
  }

  async stop() {
    await this.server.stop()
  }
}
