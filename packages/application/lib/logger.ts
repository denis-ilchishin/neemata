import { threadId } from 'node:worker_threads'
import type { Level, Logger as PinoLogger } from 'pino'
import pino, { stdTimeFunctions } from 'pino'
import pretty from 'pino-pretty'

export type Logger = PinoLogger

const bg = (value, color) => `\x1b[${color}m${value}\x1b[0m`
const fg = (value, color) => `\x1b[38;5;${color}m${value}\x1b[0m`

const levelColors = {
  10: 100,
  20: 102,
  30: 106,
  40: 104,
  50: 101,
  60: 105,
  [Infinity]: 0,
}
const messageColors = {
  10: 0,
  20: 2,
  30: 6,
  40: 4,
  50: 1,
  60: 5,
  [Infinity]: 0,
}

const levelLabels = {
  10: 'TRACE',
  20: 'DEBUG',
  30: 'INFO ',
  40: 'WARN ',
  50: 'ERROR',
  60: 'FATAL',
  [Infinity]: 'SILENT',
}

export const createLogger = (level: Level, $group) =>
  pino(
    {
      timestamp: stdTimeFunctions.isoTime,
      level,
    },
    pretty({
      colorize: true,
      include: 'time,level,pid',
      ignore: '$group',
      errorLikeObjectKeys: ['err', 'error', 'cause'],
      messageFormat: (log, messageKey) => {
        const group = fg(`[${log.$group}]`, 11)
        const msg = fg(log[messageKey], messageColors[log.level as number])
        const thread = fg(`(T-${threadId})`, 89)
        return `\x1b[0m${thread} ${group} ${msg}`
      },
      customPrettifiers: {
        level: (level: string) => bg(levelLabels[level], levelColors[level]),
      },
      sync: true,
    })
  ).child({ $group })
