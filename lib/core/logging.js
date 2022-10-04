const { writeFile, mkdir } = require('node:fs')
const { join, dirname } = require('node:path')
const { parentPort, isMainThread, threadId } = require('node:worker_threads')
const { WorkerEvent } = require('../enums/worker-event')

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

const getLogPrefix = () =>
  `[${new Date().toLocaleTimeString([], {
    timeStyle: 'long',
    hour12: false,
  })}] ${isMainThread ? 'Main' : `Thread-${threadId}`}`

const levels = {
  log: {
    text: styles.fg.white,
    bg: styles.bg.white,
  },
  debug: {
    text: styles.fg.green,
    bg: styles.bg.green,
  },
  info: {
    text: styles.fg.blue,
    bg: styles.bg.blue,
  },
  warn: {
    text: styles.fg.orange,
    bg: styles.bg.orange,
  },
  error: {
    text: styles.fg.red,
    bg: styles.bg.red,
  },
}

function writeToStream(stream, level, group, content) {
  const { text, bg } = levels[level] ?? levels.log
  const _prefix = `${text}${getLogPrefix()}${styles.reset}`
  const _level = `${bg} ${level} ${styles.reset}`
  const _content = `${text}${content}${styles.reset}`
  stream.write(
    `${_prefix} ${_level}${group ? ` [${group}]` : ''} ${_content}\n`
  )
}

class ConsoleLogger {
  constructor(level) {
    this.levels = Array.isArray(level) ? level : [level]
  }

  log(content, group) {
    if (this.levels.includes('log'))
      writeToStream(process.stdout, 'log', group, content)
  }

  warn(content, group) {
    if (this.levels.includes('warn'))
      writeToStream(process.stdout, 'warn', group, content)
  }

  error(err, group) {
    if (this.levels.includes('error'))
      writeToStream(
        process.stderr,
        'error',
        group,
        err instanceof Error ? err.stack ?? err : err
      )
  }

  info(content, group) {
    if (this.levels.includes('info'))
      writeToStream(process.stdout, 'info', group, content)
  }

  debug(content, group) {
    if (this.levels.includes('debug'))
      writeToStream(process.stdout, 'debug', group, content)
  }
}

class FileLogger {
  constructor(path, level) {
    this.path = path
    this.levels = Array.isArray(level) ? level : [level]
  }

  #write(level, group, content) {
    parentPort.postMessage({
      event: WorkerEvent.Log,
      path: this.path,
      content: `${getLogPrefix()} ${level.toUpperCase()}:${
        group ? ` "${group}"` : ''
      } ${content}`,
    })
  }

  log(content, group) {
    if (this.levels.includes('log')) this.#write('log', group, content)
  }

  warn(content, group) {
    if (this.levels.includes('warn')) this.#write('warn', group, content)
  }

  error(err, group) {
    if (this.levels.includes('error'))
      this.#write('error', group, err instanceof Error ? err.stack ?? err : err)
  }

  info(content, group) {
    if (this.levels.includes('info')) this.#write('info', group, content)
  }

  debug(content, group) {
    if (this.levels.includes('debug')) this.#write('debug', group, content)
  }
}

class Logging {
  #application

  constructor(application) {
    this.#application = application
    this.basePath = application.appConfig.log.basePath
    this.level = this.#application.appConfig.log.level
    this.console = new ConsoleLogger(this.level)
  }

  createFileLogger(name, level) {
    return new FileLogger(
      join(this.basePath, name) + '.log',
      level || this.level
    )
  }
}

function createFileLoggingBuffer() {
  let buffer = []
  let writing = false

  function write(force = false) {
    if ((force || !writing) && buffer.length) {
      const _buffer = [...buffer]
      buffer = []
      writing = true

      const files = new Set(_buffer.map(({ path }) => path))

      for (const file of files) {
        mkdir(dirname(file), { recursive: true }, () => {
          const log = _buffer
            .filter(({ path }) => path === file)
            .map(({ content }) => content)
            .join('\n')

          writeFile(file, log + '\n', { flag: 'a' }, (err) => {
            if (err) console.error(err)
            else {
              if (buffer.length) write(true)
              else writing = false
            }
          })
        })
      }
    }
  }

  function push({ path, content }) {
    buffer.push({ path, content })
    write()
  }

  return { push }
}

module.exports = { Logging, createFileLoggingBuffer, ConsoleLogger }
