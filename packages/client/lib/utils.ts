import type { Transport, ValueOf } from '@neemata/common'

export function randomUUID() {
  if (typeof crypto.randomUUID !== 'undefined') return crypto.randomUUID()
  else {
    // @ts-ignore
    return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c) =>
      (
        c ^
        (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))
      ).toString(16)
    )
  }
}

export class NeemataError extends Error {
  constructor(code: string, message: string, public readonly data?: any) {
    super(message)
    this.name = code
  }
}

export type ApiConstructOptions = {
  transport?: ValueOf<typeof Transport>
  formData?: FormData
  version?: number
}

export type NeemataOptions = {
  host: string
  preferHttp?: boolean
  pingInterval?: number
  pingTimeout?: number
}
