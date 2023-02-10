import { ValueOf } from './utils'

export const WorkerType = {
  Api: 'api',
  Task: 'task',
  OneOff: 'oneOff',
} as const

export type WorkerType = ValueOf<typeof WorkerType>
