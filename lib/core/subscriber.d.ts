export class Subscriber {
  on: (event: string, cb: <T = any>(payload: T) => any) => void
  off: (event: string) => void
  emit: <T = any>(event: string, message: T) => void
}
