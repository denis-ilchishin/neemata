import EventEmitter from 'events'

export interface Client extends EventEmitter {
  /**
   * Client unique id
   */
  id: string

  /**
   * Client auth
   */
  auth: Auth | null
  // socket: import('ws').WebSocket
  send: (event: string, data: any) => void
  opened: boolean
}

export function createClient(
  socket: import('ws').WebSocket,
  sendToSocket: (...args: any) => void
): Client
