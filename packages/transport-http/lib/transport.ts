import { BaseTransport, ExtensionInstallOptions } from '@neemata/application'
import { HttpTransportClient } from './client'
import { HttpTransportServer } from './server'
import {
  HttpTransportApplicationContext,
  HttpTransportOptions,
  HttpTransportProcedureOptions,
} from './types'

export class HttpTransport<ClientData> extends BaseTransport<
  HttpTransportProcedureOptions,
  HttpTransportApplicationContext,
  HttpTransportClient<ClientData>
> {
  name = 'HTTP Transport'

  server: HttpTransportServer
  application!: ExtensionInstallOptions<
    HttpTransportProcedureOptions,
    HttpTransportApplicationContext
  >

  constructor(readonly options: HttpTransportOptions<ClientData>) {
    super(options.clientProvider)
  }

  install(
    application: ExtensionInstallOptions<
      HttpTransportProcedureOptions,
      HttpTransportApplicationContext
    >
  ) {
    this.application = application
    this.server = new HttpTransportServer(this.options, application)
  }

  async start() {
    await this.server.start()
  }

  async stop() {
    await this.server.stop()
  }
}
