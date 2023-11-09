import { threadId } from 'node:worker_threads'
import type { Level, Logger as PinoLogger } from 'pino'
import pino, { stdTimeFunctions } from 'pino'
import pretty from 'pino-pretty'

export type Logger = PinoLogger

export const createLogger = (level: Level, $group) =>
  pino(
    {
      timestamp: stdTimeFunctions.isoTime,
      level,
    },
    pretty({
      colorize: true,
      errorLikeObjectKeys: ['err', 'error', 'cause'],
      messageFormat: (log, messageKey) => {
        const group = log.$group
        if (group) delete log.$group
        return (
          (group ? `[${group}] ` : '') + `(T${threadId}) ${log[messageKey]}`
        )
      },
      sync: true,
    })
  ).child({ $group })
