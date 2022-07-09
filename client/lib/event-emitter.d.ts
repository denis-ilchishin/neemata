export class EventEmitter {
  on(name: string, cb: () => any): void
  once(name: string, cb: () => any): void
  off(name: string, cb: () => any): void
  emit(name: string, ...args: any[]): void
}
