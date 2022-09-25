import { Protocol } from './enums'
import { EventEmitter } from './event-emitter'

export class Neemata extends EventEmitter {
  constructor(options: {
    host: string

    /**
     * Do not establish WS connection
     * @default false
     */
    preferHttp?: boolean

    basePath?: string

    /**
     * Timeout for reconnect in ms
     * @default true
     */
    autoreconnect?: boolean

    /**
     * Interval for sending ping event to server
     * @default false | number
     */
    ping?: number | boolean
  })

  ws?: WebSocket
  connecting?: Promise<void>
  api: <T = any>(
    module: string,
    data?: any,
    options?: { version?: string; protocol?: Protocol; formData?: true }
  ) => Promise<T>
  connect: () => Promise<void>
  reconnect: () => Promise<void>
  setAuth: (val: any) => void
}
