import { MessageType } from './message-type'
import { Transport } from './transport'

export interface ApiResponse {
  error: {
    code: string
    message?: string
  } | null
  data?: any
}

export interface WSTransportCallInterface<Type extends MessageType> {
  type: Type
  payload: Type extends typeof MessageType.Call
    ? {
        procedure: string
        correlationId: string
        data?: any
      }
    : { event: string; data?: any }
}

export interface WSTransportCallResponse<Type extends MessageType> {
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
  transport?: Transport
}

export type ApiIntrospectResponse = ApiIntrospectProcedure[]
