import { BaseTransport } from '@neemata/application'
import { WebsocketsTransportServer } from './server'
import {
  HttpTransportApplicationContext,
  HttpTransportData,
  HttpTransportProcedureOptions,
  WebsocketsTransportApplicationContext,
  WebsocketsTransportData,
  WebsocketsTransportOptions,
  WebsocketsTransportProcedureOptions,
} from './types'

export class WebsocketsTransport<
  Options extends WebsocketsTransportOptions = WebsocketsTransportOptions
> extends BaseTransport<
  HttpTransportProcedureOptions & WebsocketsTransportProcedureOptions,
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
