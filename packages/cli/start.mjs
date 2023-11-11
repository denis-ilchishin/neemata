#!/usr/bin/env node --loader tsx/esm --no-warnings

import { application } from './cli.mjs'

const { logger } = application

const terminate = () => tryExit(() => application.stop())
let exitTimeout

const exitProcess = () => {
  if (exitTimeout) clearTimeout(exitTimeout)
  process.exit(0)
}

const tryExit = async (cb) => {
  if (exitTimeout) return
  exitTimeout = setTimeout(exitProcess, 10000)
  try {
    await cb()
  } catch (error) {
    logger.error(error)
  } finally {
    exitProcess()
  }
}

process.on('uncaughtException', (error) => logger.error(error))
process.on('unhandledRejection', (error) => logger.error(error))
process.on('SIGTERM', terminate)
process.on('SIGINT', terminate)

await application.start()
