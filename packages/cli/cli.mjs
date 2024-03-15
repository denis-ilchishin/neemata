#!/usr/bin/env node --enable-source-maps

import { register } from 'node:module'
import { resolve } from 'node:path'
import repl from 'node:repl'
import { parseArgs } from 'node:util'
import {
  APP_COMMAND,
  Application,
  WorkerType,
  defer,
  importDefault,
} from '@neematajs/application'

/** @type {import('@neematajs/server')} */
const NeemataServer = await import('@neematajs/server').catch(() => null)

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
  },
})

const [command, ...args] = positionals
const { env, entry, swc, ...kwargs } = values

const entryPath = resolve(
  process.env.NEEMATA_ENTRY || (typeof entry === 'string' ? entry : 'index.ts'),
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
  !(
    (NeemataServer && entryApp instanceof NeemataServer.ApplicationServer) ||
    entryApp instanceof Application
  )
) {
  throw new Error(
    'Invalid entry module. Must be an instance of Application or ApplicationServer',
  )
}

const { logger } = entryApp

process.on('uncaughtException', (error) => logger.error(error))
process.on('unhandledRejection', (error) => logger.error(error))

const loadApp = async (workerType) => {
  /** @type {Application} */
  let app

  if (NeemataServer && entryApp instanceof NeemataServer.ApplicationServer) {
    const { applicationPath } = entryApp.options
    /** @type {import('@neematajs/server').ApplicationWorkerOptions} */
    const options = {
      id: 0,
      workerType,
      isServer: false,
    }
    NeemataServer.providerWorkerOptions(options)
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
  async execute() {
    const app = await loadApp(WorkerType.Task)

    const [inputCommand, ...commandArgs] = args

    let [extension, commandName] = inputCommand.split(':')

    if (!commandName) {
      commandName = extension
      extension = undefined
    }

    const command = app.registry.commands
      .get(extension ?? APP_COMMAND)
      ?.get(commandName)
    if (!command) throw new Error(`Unknown application command: ${commandName}`)

    const terminate = () => tryExit(() => defer(() => app.stop()))

    process.on('SIGTERM', terminate)
    process.on('SIGINT', terminate)

    await app.initialize()
    await command({ args: commandArgs, kwargs }).finally(terminate)
  },
  async repl() {
    const app = await loadApp(WorkerType.Api)
    await app.initialize()
    globalThis.app = app
    repl.start({ useGlobal: true })
  },
}

if (command in commands === false)
  throw new Error(`Unknown CLI command: ${command}`)

commands[command]()
