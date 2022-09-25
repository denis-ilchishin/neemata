const { threadId, isMainThread } = require('node:worker_threads')

const colours = {
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

class Console {
  constructor() {}

  get #prefix() {
    return `[${new Date().toLocaleTimeString([], {
      timeStyle: 'medium',
      hour12: false,
    })}] ${isMainThread ? 'Main' : `Thread-${threadId}`}`
  }

  #types = {
    log: {
      text: colours.fg.white,
      bg: colours.bg.white,
      method: console.log,
    },
    debug: {
      text: colours.fg.green,
      bg: colours.bg.green,
      method: console.log,
    },
    info: {
      text: colours.fg.blue,
      bg: colours.bg.blue,
      method: console.log,
    },
    warn: {
      text: colours.fg.orange,
      bg: colours.bg.orange,
      method: console.log,
    },
    error: {
      text: colours.fg.red,
      bg: colours.bg.red,
      method: console.log,
    },
  }

  #output(type, group, value) {
    const { method, text, bg } = this.#types[type]
    const _prefix = `${text}${this.#prefix}${colours.reset}`
    const _type = `${bg} ${type} ${colours.reset}`
    const _value = `${text}${value}${colours.reset}`

    return [
      method,
      `${_prefix} ${_type}${group ? ` [${group}]` : ''} ${_value}`,
    ]
  }

  #print(type, group, value) {
    const [method, output] = this.#output(type, group, value)
    method(output)
  }

  log(value, group) {
    this.#print('log', group, value)
  }
  warn(value, group) {
    this.#print('warn', group, value)
  }
  error(value, group) {
    this.#print('error', group, value)
  }
  exception(err, group) {
    this.#print('error', group, err.stack ?? err)
  }
  info(value, group) {
    this.#print('info', group, value)
  }
  debug(value, group) {
    this.#print('debug', group, value)
  }
}

const _console = new Console()

module.exports = {
  Console,
  console: _console,
}
