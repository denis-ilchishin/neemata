#!/usr/bin/env node --loader tsx/esm --no-warnings

import { entryModule, tryExit } from './cli.mjs'

const terminate = () => tryExit(() => entryModule.stop())

process.on('SIGTERM', terminate)
process.on('SIGINT', terminate)

await entryModule.start()
