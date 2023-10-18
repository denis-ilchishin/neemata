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
      default: 'application/index.ts',
    },
    env: {
      type: 'string',
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

const load = () =>
  import(applicationPath)
    .catch(() => ({ default: {} }))
    .then(async (module) => {
      const defaultOptions = {
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
      }
      const appOptions = defaults(module.default, defaultOptions)
      return [appOptions, new App(appOptions)]
    })

const [options, app] = await load()

export { app, command, options, taskName }
