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

export interface WSTransportCallInterface<
  Type extends ValueOf<typeof MessageType>
> {
  type: Type
  payload: Type extends typeof MessageType.Call
    ? {
        procedure: string
        correlationId: string
        version: number
        data?: any
      }
    : { event: string; data?: any }
}

export interface WSTransportCallResponse<
  Type extends ValueOf<typeof MessageType>
> {
  type: Type
  payload: Type extends typeof MessageType.Event
    ? {
        procedure: string
        correlationId: string
      } & ApiResponse
    : ApiResponse
}

interface ApiIntrospectProcedure {
  name: string
  version: number
  transport?: ValueOf<typeof Transport>
}

export type ApiIntrospectResponse = ApiIntrospectProcedure[]
