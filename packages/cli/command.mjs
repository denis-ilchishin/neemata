#!/usr/bin/env node --import tsx/esm --no-warnings

import {
  Application,
  ApplicationServer,
  WorkerType,
  importDefault,
} from '@neemata/application'
import { args, entryModule, kwargs, tryExit } from './cli.mjs'

/** @type {Application} */
let application

if (entryModule instanceof ApplicationServer) {
  const { applicationPath } = entryModule.options
  const bootstrap = await importDefault(applicationPath)
  const type = WorkerType.Task
  /** @type {import('@neemata/application').ApplicationWorkerOptions} */
  const options = {
    id: 0,
    type,
  }

  application = await bootstrap(options)
} else if (entryModule instanceof Application) {
  application = entryModule
} else {
  throw new Error(
    'Invalid entry module. Must be an instance of Application or ApplicationServer'
  )
}

const [inputCommand, ...commandArgs] = args

let [extension, commandName] = inputCommand.split(':')

if (!commandName) {
  commandName = extension
  extension = undefined
}

const command = application.commands.get(extension)?.get(commandName)
if (!command) throw new Error('Command not found')

const terminate = () =>
  tryExit(async () => {
    task.abort()
    await task.result
  })

process.on('SIGTERM', terminate)
process.on('SIGINT', terminate)

await application.initialize()

/** @type {import('@neemata/application').TaskInterface} */
const task = command({ args: commandArgs, kwargs })
task.result.finally(() => application.terminate())
