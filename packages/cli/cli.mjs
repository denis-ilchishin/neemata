#!/usr/bin/env node --enable-source-maps

import { fork } from 'node:child_process'
import { register } from 'node:module'
import { resolve } from 'node:path'
import repl from 'node:repl'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import {
  APP_COMMAND,
  Application,
  WorkerType,
  defer,
  importDefault,
} from '@neematajs/application'
import { config } from 'dotenv'

/** @type {import('@neematajs/server')} */
const NeemataServer = await import('@neematajs/server').catch(() => null)

const { values, positionals } = parseArgs({
  allowPositionals: true,
  strict: false,
  options: {
    entry: {
      type: 'string',
      multiple: false,
    },
    swc: {
      type: 'boolean',
      multiple: false,
    },
    timeout: {
      type: 'string',
      multiple: false,
    },
    env: {
      type: 'string',
      multiple: true,
      default: [],
    },
    watch: {
      type: 'boolean',
      multiple: false,
    },
  },
})

const [command, ...args] = positionals
const { watch, env: envPaths, entry, swc, timeout, ...kwargs } = values

if (watch) {
  // spawn the same script with nodejs --watch flag
  const forkArgs = process.argv.slice(2).filter((arg) => arg !== '--watch')
  fork(fileURLToPath(import.meta.url), forkArgs, {
    cwd: process.cwd(),
    execArgv: ['--enable-source-maps', '--watch'],
    stdio: 'inherit',
    env: {
      ...process.env,
      NEEMATA_WATCH: '1',
    },
  })
} else {
  const shutdownTimeout =
    (typeof timeout === 'string' ? Number.parseInt(timeout) : undefined) || 1000

  for (const env of envPaths) {
    if (typeof env === 'string') {
      const { error } = config({ path: env })
      if (error) console.warn(error)
    }
  }

  const entryPath = resolve(
    process.env.NEEMATA_ENTRY ||
      (typeof entry === 'string' ? entry : swc ? 'index.ts' : 'index.js'),
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
    exitTimeout = setTimeout(exitProcess, shutdownTimeout)
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

  const loadApp = async (workerType, workerOptions = {}) => {
    /** @type {Application} */
    let app

    if (NeemataServer && entryApp instanceof NeemataServer.ApplicationServer) {
      const { applicationPath } = entryApp.options
      /** @type {Parameters<typeof NeemataServer.providerWorkerOptions>[0]} */
      const options = {
        id: 0,
        workerType,
        isServer: false,
        workerOptions,
      }
      NeemataServer.providerWorkerOptions(options)
      app = await importDefault(applicationPath)
    } else if (entryApp instanceof Application) {
      app = entryApp
    }

    return app
  }

  const commands = {
    async start() {
      const terminate = () => tryExit(() => entryApp.stop())
      process.on('SIGTERM', terminate)
      process.on('SIGINT', terminate)
      if (
        process.env.NEEMATA_WATCH &&
        entryApp instanceof NeemataServer.ApplicationServer
      ) {
        // start only one api worker in watch mode
        const app = await loadApp(
          WorkerType.Api,
          entryApp.options.apiWorkers[0],
        )
        await app.start()
      } else {
        await entryApp.start()
      }
    },
    async execute() {
      const app = await loadApp(WorkerType.Task)

      const [inputCommand, ...commandArgs] = args

      let [extension, commandName] = inputCommand.split(':')

      if (!commandName) {
        commandName = extension
        extension = undefined
      }

      const terminate = () => tryExit(() => defer(() => app.stop()))

      process.on('SIGTERM', terminate)
      process.on('SIGINT', terminate)

      await app.initialize()

      const command = app.registry.commands
        .get(extension ?? APP_COMMAND)
        ?.get(commandName)

      if (!command)
        throw new Error(`Unknown application command: ${commandName}`)

      try {
        await command({ args: commandArgs, kwargs })
      } finally {
        terminate()
      }
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
}
