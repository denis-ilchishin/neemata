import { ValueOf } from './utils'

export const WorkerHook = {
  Startup: 'startup',
  Shutdown: 'shutdown',
  Connect: 'connect',
  Disconnect: 'disconnect',
  Call: 'call',
} as const

export type WorkerHook = ValueOf<typeof WorkerHook>
