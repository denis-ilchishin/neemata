import { Application, ApplicationServer } from '@neemata/application'
import dotenv from 'dotenv'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'

const { values, positionals: args } = parseArgs({
  allowPositionals: true,
  strict: false,
  options: {
    entry: {
      type: 'string',
      short: 'a',
      multiple: false,
    },
    env: {
      type: 'string',
      short: 'e',
      multiple: true,
    },
  },
})

const { env, ...kwargs } = values

if (env) {
  for (const path of env) {
    const { error } = dotenv.config({ path: resolve(path) })
    if (error) throw error
  }
}

const entry = resolve(values.entry || process.env.NEEMATA_ENTRY)

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

const entryModule = await import(entry).then((module) => module.default)

if (
  !(
    entryModule instanceof ApplicationServer ||
    entryModule instanceof Application
  )
) {
  throw new Error(
    'Invalid entry module. Must be an instance of Application or ApplicationServer'
  )
}

const { logger } = entryModule

process.on('uncaughtException', (error) => logger.error(error))
process.on('unhandledRejection', (error) => logger.error(error))

export { args, entryModule, kwargs, tryExit }
