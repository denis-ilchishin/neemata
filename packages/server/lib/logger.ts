import { threadId } from 'node:worker_threads'
import pino, { stdTimeFunctions } from 'pino'
import pretty from 'pino-pretty'

export const createLogger = (level) =>
  pino(
    {
      timestamp: stdTimeFunctions.isoTime,
      level,
    },
    pretty({
      colorize: true,
      errorLikeObjectKeys: ['err', 'error', 'cause'],
      messageFormat: (log, messageKey) => `(T${threadId}) ${log[messageKey]}`,
      sync: true,
    })
  )
