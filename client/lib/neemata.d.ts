import { EventEmitter } from './event-emitter'

export class Neemata<Api = any> extends EventEmitter {
  constructor(options: {
    host: string
    preferHttp?: boolean
    basePath?: string
    /**
     * Timeout for reconnect in ms
     */
    autoreconnect?: false | number
  }) {}

  connecting: boolean
  api: Api
  ws?: WebSocket
  connect: () => Promise<void>
  reconnect: () => void
  setAuth: (val: any) => void
}
