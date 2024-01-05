import { BaseTransport } from '@neemata/application'
import { HttpTransportClient } from './client'
import { HttpTransportServer } from './server'
import {
  HttpTransportApplicationContext,
  HttpTransportData,
  HttpTransportOptions,
  HttpTransportProcedureOptions,
} from './types'

export class HttpTransport extends BaseTransport<
  HttpTransportProcedureOptions,
  HttpTransportApplicationContext,
  HttpTransportClient,
  HttpTransportData
> {
  name = 'HTTP Transport'

  server!: HttpTransportServer

  constructor(readonly options: HttpTransportOptions) {
    super()
  }

  initialize() {
    this.server = new HttpTransportServer(this.options, this.application)
  }

  async start() {
    await this.server.start()
  }

  async stop() {
    await this.server.stop()
  }
}
