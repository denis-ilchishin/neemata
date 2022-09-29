import { EventEmitter } from './event-emitter'

export class NeemataError extends Error {
  data: any
}

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
  api: any
  connect: () => Promise<void>
  reconnect: () => Promise<void>
  setAuth: (val: any) => void
  wsState?: WebSocket['readyState']
  wsActive: boolean
}
