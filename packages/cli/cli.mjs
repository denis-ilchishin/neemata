#!/usr/bin/env node --enable-source-maps

import { register } from 'node:module'
import { resolve } from 'node:path'
import repl from 'node:repl'
import { parseArgs } from 'node:util'
import {
  APP_COMMAND,
  Application,
  ApplicationServer,
  WorkerType,
  defer,
  importDefault,
  providerWorkerOptions,
  watchApp,
} from '@neematajs/application'
import dotenv from 'dotenv'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  strict: false,
  options: {
    entry: {
      type: 'string',
      short: 'a',
      multiple: false,
    },
    swc: {
      type: 'boolean',
      multiple: false,
    },
    env: {
      type: 'string',
      short: 'e',
      multiple: true,
    },
  },
})

const [command, ...args] = positionals
const { env, entry, swc, ...kwargs } = values

if (env) {
  for (const path of env) {
    if (typeof path === 'string') {
      const { error } = dotenv.config({ path: resolve(path) })
      if (error) throw error
    }
  }
}

const entryPath = resolve(
  process.env.NEEMATA_ENTRY || (typeof entry === 'string' ? entry : 'index.js'),
)

if (swc) {
  const url = new URL('./swc-loader.mjs', import.meta.url)
  process.env.NEEMATA_SWC = url.toString()
  register(url)
}

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

const entryApp = await import(entryPath).then((module) => module.default)

if (
  !(entryApp instanceof ApplicationServer || entryApp instanceof Application)
) {
  throw new Error(
    'Invalid entry module. Must be an instance of Application or ApplicationServer',
  )
}

const { logger } = entryApp

process.on('uncaughtException', (error) => logger.error(error))
process.on('unhandledRejection', (error) => logger.error(error))

const loadApp = async () => {
  /** @type {Application} */
  let app

  if (entryApp instanceof ApplicationServer) {
    const { applicationPath } = entryApp.options
    const type = WorkerType.Task
    /** @type {import('@neematajs/application').ApplicationWorkerOptions} */
    const options = {
      id: 0,
      type,
    }
    providerWorkerOptions(options)
    app = await importDefault(applicationPath)
  } else if (entryApp instanceof Application) {
    app = entryApp
  }

  return app
}

const commands = {
  start() {
    const terminate = () => tryExit(() => entryApp.stop())
    process.on('SIGTERM', terminate)
    process.on('SIGINT', terminate)
    entryApp.start()
  },
  watch() {
    const url = new URL('./watch.mjs', import.meta.url)
    if (entryApp instanceof Application) {
      watchApp(url.toString(), entryApp)
    } else {
      process.env.NEEMATA_WATCH = url.toString()
    }
    this.start()
  },
  async execute() {
    const app = await loadApp()

    const [inputCommand, ...commandArgs] = args

    let [extension, commandName] = inputCommand.split(':')

    if (!commandName) {
      commandName = extension
      extension = undefined
    }

    const command = app.registry.commands
      .get(extension ?? APP_COMMAND)
      ?.get(commandName)
    if (!command) throw new Error('Command not found')

    const terminate = () => tryExit(() => defer(() => app.stop()))

    process.on('SIGTERM', terminate)
    process.on('SIGINT', terminate)

    await app.initialize()
    await command({ args: commandArgs, kwargs }).finally(terminate)
  },
  async repl() {
    const app = await loadApp()
    await app.initialize()
    globalThis.app = app
    repl.start({ useGlobal: true })
  },
}

commands[command]()
