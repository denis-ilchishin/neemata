import { BaseAdapter, ExtensionInstallOptions } from '@neemata/application'
import { Server } from './server'
import {
  AdapterContext,
  AdapterOptions,
  AdapterProcedureOptions,
} from './types'

export class Adapter extends BaseAdapter<
  AdapterProcedureOptions,
  AdapterContext
> {
  name = 'μWebSockets'
  server: Server
  application!: ExtensionInstallOptions<AdapterProcedureOptions, AdapterContext>

  constructor(readonly options?: AdapterOptions) {
    super()
  }

  context(): AdapterContext {
    const { rooms, websockets } = this.server
    return { rooms, websockets }
  }

  install(
    application: ExtensionInstallOptions<
      AdapterProcedureOptions,
      AdapterContext
    >
  ) {
    this.application = application
    this.server = new Server(this.options, application)
  }

  async start() {
    await this.server.start()
  }

  async stop() {
    await this.server.stop()
  }
}
