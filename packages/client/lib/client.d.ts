export type NeemataOptions = {
  host: string
  /**
   * @default false
   */
  preferHttp?: boolean
  /**
   * @default '/api'
   */
  basePath?: string
}

export class NeemataError extends Error {
  constructor(code: string, message: string, data: ?any)
}

export class Neemata extends import('events').EventEmitter {
  constructor(options: NeemataOptions)

  ws?: WebSocket
  connecting?: Promise<any>
  auth?: string

  api: any

  setAuth(auth: string): void

  introspect(): Promise<any>
  connect(): Promise<void>
  reconnect(): Promise<void>

  isActive: boolean
}
