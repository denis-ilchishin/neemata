import { ValueOf } from './utils'

export const Transport = {
  Ws: 'ws',
  Http: 'http',
} as const

export type Transport = ValueOf<typeof Transport>
