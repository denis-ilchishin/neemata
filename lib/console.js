'use strict'

const { workerData, threadId, isMainThread } = require('node:worker_threads')
const { type } = workerData ?? {}

const styles = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[4m',
  underscore: '\x1b[4m',
  hidden: '\x1b[8m',
  strokethrough: '\x1b[9m',
  fg: {
    black: '\x1b[30m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    orange: '\x1b[34m',
    magenpurpleta: '\x1b[35m',
    blue: '\x1b[36m',
    white: '\x1b[37m',
  },
  bg: {
    black: '\x1b[40m',
    red: '\x1b[41m',
    green: '\x1b[42m',
    yellow: '\x1b[43m',
    orange: '\x1b[44m',
    purple: '\x1b[45m',
    blue: '\x1b[46m',
    white: '\x1b[47m',
  },
}

const levels = {
  debug: {
    weight: 0,
    text: styles.fg.green,
    bg: styles.bg.green,
  },
  info: {
    weight: 1,
    text: styles.fg.blue,
    bg: styles.bg.blue,
  },
  warn: {
    weight: 2,
    text: styles.fg.orange,
    bg: styles.bg.orange,
  },
  error: {
    weight: 3,
    text: styles.fg.red,
    bg: styles.bg.red,
  },
}

const getThread = () =>
  isMainThread ? 'Main' : `${type ? type + ' ' : ''}Worker-${threadId}`

function writeToStream(stream, level, group, content) {
  const { text, bg } = levels[level] ?? levels.log
  const _level = `${bg} ${level.toUpperCase()} ${level.length < 5 ? ' ' : ''}${
    styles.reset
  }`
  const _prefix = `${text}[${new Date().toISOString()}] ${_level} ${getThread()}${
    styles.reset
  }`
  const _content = `${text}${content}${styles.reset}`
  stream.write(`${_prefix}${group ? ` [${group}]` : ''} ${_content}\n`)
}

function getLevels(level) {
  return Object.entries(levels)
    .filter((l) => l[1].weight >= levels[level].weight)
    .map((l) => l[0])
}

class ConsoleLogger {
  constructor(level, group) {
    this.levels = getLevels(level)
    this.group = group
  }

  error(err, group = this.group) {
    if (this.levels.includes('error'))
      writeToStream(
        process.stderr,
        'error',
        group,
        err instanceof Error ? err.stack ?? err : err
      )
  }

  warn(content, group = this.group) {
    if (this.levels.includes('warn'))
      writeToStream(process.stdout, 'warn', group, content)
  }

  info(content, group = this.group) {
    if (this.levels.includes('info'))
      writeToStream(process.stdout, 'info', group, content)
  }

  debug(content, group = this.group) {
    if (this.levels.includes('debug'))
      writeToStream(process.stdout, 'debug', group, content)
  }
}

module.exports = { ConsoleLogger }
