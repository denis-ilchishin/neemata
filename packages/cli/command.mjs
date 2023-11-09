#!/usr/bin/env node --loader tsx/esm --no-warnings

import { application, args, kwargs } from './cli.mjs'

const { logger } = application

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

const [inputCommand, ...commandArgs] = args

const [extension, commandName] = inputCommand.split(':')
const command = application.commands.get(extension)?.get(commandName)
if (!command) throw new Error('Command not found')

const terminate = () => tryExit(() => application.stop())

process.on('uncaughtException', (error) => logger.error(error))
process.on('unhandledRejection', (error) => logger.error(error))
process.once('SIGTERM', terminate)
process.once('SIGINT', terminate)

command({ args: commandArgs, kwargs })
