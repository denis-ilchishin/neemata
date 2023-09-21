import pino, { stdTimeFunctions } from 'pino'
import pretty from 'pino-pretty'

export const logger = pino(
  {
    timestamp: stdTimeFunctions.isoTime,
  },
  pretty()
)
