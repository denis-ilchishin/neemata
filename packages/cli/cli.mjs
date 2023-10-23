#!/usr/bin/env node --loader tsx/esm --no-warnings

import { TaskWorker } from '@neemata/server'
import { app, command, options, taskName } from './application.mjs'

const logger = app.config.logger

const Command = {
  Server: 'server',
  Task: 'task',
}

const commands = Object.values(Command)
if (!commands.includes(command))
  throw new Error(
    `Unknown command: ${command}. Available commands: ${commands.join(', ')}`
  )

let terminate
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

const handlers = {
  [Command.Server]: async () => {
    await app.start()
    terminate = () => tryExit(() => app.stop())
  },
  [Command.Task]: async () => {
    logger.info('Running task [%s]', taskName)
    if (!taskName) throw new Error('Task name is required')
    const taskWorker = await TaskWorker.create(options)
    const taskDefinition = taskWorker.tasks.modules.get(taskName)
    if (!taskDefinition) throw new Error('Task not found')
    const task = taskWorker.invoke(taskDefinition, { args: [] })
    logger.info('Task [%s] started', task.taskId)
    const execution = task
      .then(() => taskWorker.stop())
      .catch(() => taskWorker.stop())
    terminate = () =>
      tryExit(async () => {
        task.abort()
        return await execution
      })
  },
}

process.on('uncaughtException', (error) => logger.error(error))
process.on('unhandledRejection', (error) => logger.error(error))

await handlers[command]()

process.once('SIGTERM', terminate)
process.once('SIGINT', terminate)
