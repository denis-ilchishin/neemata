import { threadId } from 'node:worker_threads'
import pino, { stdTimeFunctions } from 'pino'
import pretty from 'pino-pretty'

export const logger = pino(
  {
    timestamp: stdTimeFunctions.isoTime,
  },
  pretty({
    colorize: true,
    errorLikeObjectKeys: ['err', 'error', 'cause'],
    messageFormat: (log, messageKey) => {
      const message = log[messageKey]
      const thread = `Thread(${threadId ? `task-${threadId}` : 'server'})`
      return `${thread} ${message}`
    },
  })
)

/**
 * @param {import('../types').ApplicationConfig} userAppConfig
 */
export const setLoggerSettings = (userAppConfig) => {
  logger.level = userAppConfig.logging?.level || 'info'
}
