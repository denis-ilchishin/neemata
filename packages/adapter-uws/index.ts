import {
  AdapterConnectionContext,
  AdapterHook,
  WebSocketInterface,
} from './lib/types'

export { Adapter } from './lib/adapter'
export { Transport } from './lib/types'
export type {
  AdapterConnectionContext,
  Room,
  Stream,
  StreamMeta,
  WebSocketInterface as WebSocket,
} from './lib/types'

declare module '@neemata/application' {
  export interface ExtensionInstallOptions {
    registerHook(
      hookName: typeof AdapterHook.Connection,
      hook: (request: AdapterConnectionContext, ws: WebSocketInterface) => any
    ): any
  }
}
