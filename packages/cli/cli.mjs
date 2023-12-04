import dotenv from 'dotenv'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  strict: false,
  options: {
    applicationPath: {
      type: 'string',
      short: 'a',
    },
    env: {
      type: 'string',
      short: 'e',
      multiple: true,
    },
  },
})

let { env, applicationPath, ...kwargs } = values

if (env) {
  for (const path of env) {
    const { error } = dotenv.config({ path: resolve(path) })
    if (error) throw error
  }
}

applicationPath = resolve(
  applicationPath || process.env.NEEMATA_APPLICATION_PATH
)

const args = positionals

const application = await import(applicationPath).then(
  (module) => module.default
)

const { logger } = application

process.on('uncaughtException', (error) => logger.error(error))
process.on('unhandledRejection', (error) => logger.error(error))

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

export { application, args, kwargs, tryExit }
