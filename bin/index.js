#!/usr/bin/env node

const { parseArgs } = require('node:util')
const { resolve } = require('node:path')

const { start } = require('../index')

const { positionals, values } = parseArgs({
  options: {
    config: { type: 'string', short: 'c' },
    root: { type: 'string', short: 'r' },
    scheduler: { type: 'boolean', short: 's' },
    timeout: { type: 'string', short: 't' },
  },
  allowPositionals: true,
  strict: true,
})

const { config, root, timeout, scheduler: startScheduler } = values
const [command, ...args] = positionals

const rootPath = root ? resolve(root) : resolve('application')
const configPath = config ? resolve(config) : resolve('neemata.config.js')

start({
  rootPath,
  configPath,
  startScheduler,
  command,
  args,
  timeout: parseInt(timeout) || 0,
})
