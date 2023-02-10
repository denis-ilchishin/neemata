import { ValueOf } from './utils'

export const WorkerMessage = {
  Startup: 'startup',
  Shutdown: 'shutdown',
  Invoke: 'invoke',
  Result: 'result',
  Reload: 'reload',
  CreateLog: 'create_log',
  Log: 'log',
} as const

export type WorkerMessage = ValueOf<typeof WorkerMessage>
