import { ValueOf } from './utils'

export const MessageType = {
  Call: 'call',
  Event: 'event',
} as const

export type MessageType = ValueOf<typeof MessageType>
