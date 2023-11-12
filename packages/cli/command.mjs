#!/usr/bin/env node --loader tsx/esm --no-warnings

import { application, args, kwargs, tryExit } from './cli.mjs'

const [inputCommand, ...commandArgs] = args

const [extension, commandName] = inputCommand.split(':')
const command = application.commands.get(extension)?.get(commandName)
if (!command) throw new Error('Command not found')

const terminate = () => tryExit(() => application.stop())

process.once('SIGTERM', terminate)
process.once('SIGINT', terminate)

command({ args: commandArgs, kwargs })
