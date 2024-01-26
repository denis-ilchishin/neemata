export type EventsType = { [K: string]: any }
export class EventEmitter<
  Events extends EventsType = EventsType,
  EventNames extends Exclude<keyof Events, symbol | number> = Exclude<
    keyof Events,
    symbol | number
  >,
> extends EventTarget {
  on<E extends EventNames>(
    event: E | (Object & string),
    listener: (payload: Events[E]) => void,
    options?: AddEventListenerOptions,
  ) {
    const _listener: any = (event: CustomEvent<Events[E]>) =>
      listener(event.detail)
    this.addEventListener(event, _listener, options)
    const removeListener = () => this.removeEventListener(event, _listener)
    return { listener: _listener, removeListener }
  }

  once<E extends EventNames>(
    event: E | (Object & string),
    listener: (payload: Events[E]) => void,
  ) {
    return this.on(event, listener, { once: true })
  }

  off(event: EventNames | (Object & string), listener: any) {
    this.removeEventListener(event, listener)
  }

  emit<E extends EventNames>(
    event: E | (Object & string),
    ...args: Events[E] extends never ? [detail?: any] : [detail: Events[E]]
  ) {
    const [detail] = args
    return this.dispatchEvent(new CustomEvent(event, { detail }))
  }
}

export const once = (ee: EventEmitter, event: string) =>
  new Promise((resolve) => ee.once(event, resolve))
