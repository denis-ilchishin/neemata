import { BaseTransport } from '@neemata/application'
import { HttpTransportClient, HttpTransportData } from '@neemata/transport-http'
import { WebsocketsTransportClient } from './client'
import { WebsocketsTransportServer } from './server'
import {
  WebsocketsTransportApplicationContext,
  WebsocketsTransportData,
  WebsocketsTransportOptions,
  WebsocketsTransportProcedureOptions,
} from './types'

export class WebsocketsTransport<
  Options extends WebsocketsTransportOptions
> extends BaseTransport<
  WebsocketsTransportProcedureOptions,
  WebsocketsTransportApplicationContext,
  Options['http'] extends true
    ? WebsocketsTransportClient | HttpTransportClient
    : WebsocketsTransportClient,
  Options['http'] extends true
    ? WebsocketsTransportData | HttpTransportData
    : WebsocketsTransportData
> {
  name = 'Websockets Transport'
  server!: WebsocketsTransportServer

  constructor(readonly options: Options) {
    super()
  }

  initialize() {
    this.server = new WebsocketsTransportServer(this.options, this.application)
  }

  async start() {
    await this.server.start()
  }

  async stop() {
    await this.server.stop()
  }
}
