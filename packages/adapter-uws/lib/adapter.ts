import {
  BaseAdapter,
  ExtensionInstallOptions,
  Hook,
} from '@neemata/application'
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

    application.registerHook(Hook.BeforeTerminate, async () => {
      // Only for watch mode. In production, there won't be any opened sockets at this point
      for (const ws of this.server.sockets) {
        const { container } = ws.getUserData()
        await this.server.handleDisposal(container)
      }
    })
  }

  async start() {
    await this.server.start()
  }

  async stop() {
    await this.server.stop()
  }
}
