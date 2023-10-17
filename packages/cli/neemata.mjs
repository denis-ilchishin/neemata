#!/usr/bin/env node --loader tsx/esm --no-warnings

import { App } from '@neemata/server'
import defaults from 'defaults'
import dotenv from 'dotenv'
import os from 'node:os'
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

const hostname = values.hostname || process.env.NEEMATA_HOSTNAME || '0.0.0.0'

/**@type {ApplicationOptions['logging']['level']} */
//@ts-expect-error
const level = values.level || process.env.NEEMATA_LOG_LEVEL || 'info'

import(applicationPath)
  .catch(() => ({ default: {} }))
  .then(async (module) => {
    /**@type {ApplicationOptions} */
    const appConfig = module.default
    const port = parseInt(values.port) || 42069
    const _workersNumber = parseInt(values.workersNumber)
    const workersNumber = Number.isNaN(_workersNumber)
      ? Math.floor(os.cpus().length / 4)
      : _workersNumber
    const workersTimeout = parseInt(values.workersTimeout) || 15_000

    /**@type {ApplicationOptions} */
    const appOptions = defaults(appConfig, {
      applicationPath,
      procedures: resolve('application/api'),
      tasks: resolve('application/tasks'),
      hostname,
      port,
      logging: {
        level,
      },
      workers: {
        number: workersNumber,
        timeout: workersTimeout,
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
