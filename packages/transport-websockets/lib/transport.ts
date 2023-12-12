import { BaseTransport, ExtensionInstallOptions } from '@neemata/application'
import { WebsocketsTransportClient } from './client'
import { WebsocketsTransportServer } from './server'
import {
  WebsocketsTransportApplicationContext,
  WebsocketsTransportOptions,
  WebsocketsTransportProcedureOptions,
} from './types'

export class WebsocketsTransport<ClientData> extends BaseTransport<
  WebsocketsTransportProcedureOptions,
  WebsocketsTransportApplicationContext,
  WebsocketsTransportClient<ClientData>
> {
  name = 'Websockets Transport'
  server: WebsocketsTransportServer
  application!: ExtensionInstallOptions<
    WebsocketsTransportProcedureOptions,
    WebsocketsTransportApplicationContext
  >

  constructor(readonly options?: WebsocketsTransportOptions<ClientData>) {
    super()
  }

  install(
    application: ExtensionInstallOptions<
      WebsocketsTransportProcedureOptions,
      WebsocketsTransportApplicationContext
    >
  ) {
    this.application = application
    this.server = new WebsocketsTransportServer(this.options, application)
  }

  async start() {
    await this.server.start()
  }

  async stop() {
    await this.server.stop()
  }
}
