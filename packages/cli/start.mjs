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
process.once('SIGTERM', terminate)
process.once('SIGINT', terminate)

await application.start()

// logger.info('Running task [%s]', taskName)
//     if (!taskName) throw new Error('Task name is required')
//     const taskWorker = await TaskWorker.create(options)
//     const taskDefinition = taskWorker.tasks.modules.get(taskName)
//     if (!taskDefinition) throw new Error('Task not found')
//     const task = taskWorker.invoke(taskDefinition, { args: [] })
//     logger.info('Task [%s] started', task.taskId)
//     const execution = task
//       .then(() => taskWorker.stop())
//       .catch(() => taskWorker.stop())
