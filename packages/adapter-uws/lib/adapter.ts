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

  constructor(readonly options?: AdapterOptions) {
    super()
  }

  context(): AdapterContext {
    const { rooms, websockets } = this.server
    return { rooms, websockets }
  }

  install(
    options: ExtensionInstallOptions<AdapterProcedureOptions, AdapterContext>
  ) {
    this.server = new Server(this.options, options)
  }

  async start() {
    await this.server.start()
  }

  async stop() {
    await this.server.stop()
  }
}
