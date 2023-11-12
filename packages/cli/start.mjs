#!/usr/bin/env node --loader tsx/esm --no-warnings

import { application, tryExit } from './cli.mjs'

const terminate = () => tryExit(() => application.stop())

process.on('SIGTERM', terminate)
process.on('SIGINT', terminate)

await application.start()
