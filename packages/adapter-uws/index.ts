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
  export interface HooksInterface {
    [AdapterHook.Connection]: (
      request: AdapterConnectionContext,
      ws: WebSocketInterface
    ) => any
  }
}
