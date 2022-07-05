import { EventEmitter } from './lib/event-emitter'

export class Neemata extends EventEmitter {
  api: any
  connect: () => Promise<void>
  rooms: {
    join: (
      roomId: string
    ) => Promise<EventEmitter & { leave: () => Promise<void> }>
    leave: (roomId: string) => Promise<void>
  }
}

export function createNeemata(options: {
  url: string
  preferHttp?: boolean
}): Neemata
