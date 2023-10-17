#!/usr/bin/env node --loader tsx/esm --no-warnings

import { app, command, taskName } from './application.mjs'

if (!['server', 'task'].includes(command)) {
  throw new Error(`Unknown command: ${command}`)
}

const commands = {
  server: async () => {
    await app.start()
  },
  task: async () => {
    // if (!taskName) throw new Error('Task name is required')
    // const task = config.tasks?.find((task) => task.name === taskName)
    // if (!task) throw new Error(`Task ${taskName} not found`)
    // const { tasker } = await createApp(config)
    // await tasker.start()
    // await tasker.invoke(task)
    // await tasker.stop()
  },
}

process.on('uncaughtException', (error) => app.config.logger.error(error))
process.on('unhandledRejection', (error) => app.config.logger.error(error))

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

await commands[command]()
