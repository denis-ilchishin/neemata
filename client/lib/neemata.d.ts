import { EventEmitter } from './event-emitter'

export class Neemata<Api = any> extends EventEmitter {
  constructor(options: {
    url: string
    preferHttp?: boolean
    baseUrl?: string
  }) {}

  connecting: boolean
  api: Api
  ws?: WebSocket
  connect: () => Promise<void>
  reconnect: () => void
  setAuth: (val: any) => void
}
