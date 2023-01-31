import { MessageType } from './message-type'
import { Transport } from './transport'
import type { ValueOf } from './utils'

export interface ApiResponse {
  error: {
    code: string
    message?: string
  } | null
  data?: any
}

export interface WebSocketTransportInput<
  Type extends ValueOf<typeof MessageType>
> {
  type: Type
  payload: Type extends typeof MessageType.Call
    ? {
        module: string
        correlationId: string
        version: string
        data?: any
      }
    : { event: string; data?: any }
}

export interface WebSocketTransportOutput<
  Type extends ValueOf<typeof MessageType>
> {
  type: Type
  payload: Type extends typeof MessageType.Event
    ? {
        module: string
        correlationId: string
      } & ApiResponse
    : ApiResponse
}

interface ApiRetrospectableModule {
  name: string
  version: string
  transport?: ValueOf<typeof Transport>
}

export type ApiRetrospectRespose = ApiRetrospectableModule[]
