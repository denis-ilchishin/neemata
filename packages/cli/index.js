#!/usr/bin/env node

const { parseArgs } = require('node:util')
const { resolve } = require('node:path')

const { start } = require('@neemata/core')

const { positionals, values } = parseArgs({
  options: {
    config: { type: 'string', short: 'c', default: 'neemata.config.js' },
    root: { type: 'string', short: 'r', default: 'application' },
    scheduler: { type: 'boolean', short: 's' },
    timeout: { type: 'string', short: 't' },
    dotenv: { type: 'boolean', short: 'e', default: true },
  },
  allowPositionals: true,
  strict: true,
})

const { config, root, timeout, scheduler: startScheduler, dotenv } = values
const [command, ...args] = positionals

const rootPath = resolve(root)
const configPath = resolve(config)

if (dotenv) require('dotenv').config()

start({
  rootPath,
  configPath,
  startScheduler,
  command,
  args,
  timeout: parseInt(timeout) || 0,
})
