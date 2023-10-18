#!/usr/bin/env node --loader tsx/esm --no-warnings

import { TaskWorker } from '@neemata/server/task-worker'
import { app, command, options, taskName } from './application.mjs'

const Command = {
  Server: 'server',
  Task: 'task',
}

if (!Object.values(Command).includes(command))
  throw new Error(
    `Unknown command: ${command}. Available commands: ${Object.values(
      Command
    ).join(', ')}`
  )

const commands = {
  [Command.Server]: async () => {
    await app.start()
    let terminateTimeout
    const terminate = async () => {
      if (terminateTimeout) return
      const close = () => {
        clearTimeout(terminateTimeout)
        process.exit(0)
      }
      terminateTimeout = setTimeout(close, 10000)
      app.stop().finally(close)
    }

    process.on('SIGTERM', terminate)
    process.on('SIGINT', terminate)
  },
  [Command.Task]: async () => {
    app.config.logger.info('Running task [%s]', taskName)
    if (!taskName) throw new Error('Task name is required')
    const taskWorker = await TaskWorker.create(options)
    if (!taskWorker.tasks.modules.has(taskName))
      throw new Error('Task not found')
    await taskWorker.runTask(taskName, [], new AbortController())
    await taskWorker.stop()
  },
}

process.on('uncaughtException', (error) => app.config.logger.error(error))
process.on('unhandledRejection', (error) => app.config.logger.error(error))

await commands[command]()
