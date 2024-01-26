import { EventEmitter } from './event-emitter'

export class Subscription<Payload = any> extends EventEmitter<{
  data: Payload
  end: never
}> {
  constructor(
    readonly key: string,
    readonly unsubscribe: () => void,
  ) {
    super()
  }
}
