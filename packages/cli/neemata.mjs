#!/usr/bin/env node --loader tsx/esm --no-warnings

import { App } from '@neemata/server'
import defaults from 'defaults'
import dotenv from 'dotenv'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  strict: true,
  options: {
    applicationPath: {
      type: 'string',
      default: 'application/index',
    },
    env: {
      type: 'string',
      default: '',
    },
    level: {
      type: 'string',
    },
    hostname: {
      type: 'string',
    },
    port: {
      type: 'string',
    },
    workersNumber: {
      type: 'string',
    },
    workersTimeout: {
      type: 'string',
    },
  },
})

const [command, taskName] = positionals

if (!['server', 'task'].includes(command)) {
  throw new Error(`Unknown command: ${command}`)
}

if (values.env) {
  const { error } = dotenv.config({ path: resolve(values.env) })
  if (error) throw error
}

const applicationPath = resolve(
  values.applicationPath ||
    process.env.NEEMATA_APPLICATION_PATH ||
    'application/index.ts'
)

const {
  hostname = process.env.NEEMATA_HOSTNAME || '0.0.0.0',
  port = process.env.NEEMATA_PORT || '0.0.0.0',
  level = process.env.NEEMATA_LOG_LEVEL || 'info',
  workersNumber = process.env.NEEMATA_WORKERS_NUMBER,
  workersTimeout = process.env.NEEMATA_WORKERS_TIMEOUT,
} = values

import(applicationPath)
  .catch(() => ({ default: {} }))
  .then(async (module) => {
    /**@type {ApplicationOptions} */
    const appConfig = module.default

    /**@type {ApplicationOptions} */
    const appOptions = defaults(appConfig, {
      applicationPath,
      procedures: resolve('application/api'),
      tasks: resolve('application/tasks'),
      hostname,
      port: parseInt(port) || 42069,
      logging: {
        level,
      },
      workers: {
        number: parseInt(workersNumber) || 0,
        timeout: parseInt(workersTimeout) || 15000,
      },
    })
    const app = new App(appOptions)

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

    process.once('SIGTERM', app.stop.bind(app))
    process.once('SIGINT', app.stop.bind(app))

    await commands[command]()
  })
