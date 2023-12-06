import { Application, ApplicationServer } from '@neemata/application'

export const entryModule: ApplicationServer | Application
export const kwargs: Record<string, string>
export const args: string[]
export const tryExit: (cb: () => any) => void
