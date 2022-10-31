'use strict'

const { parentPort, threadId, workerData } = require('node:worker_threads')
const { WorkerMessage } = require('./enums')
const { pino, stdTimeFunctions } = require('pino')
const { createWriteStream, mkdirSync } = require('node:fs')
const { dirname, join } = require('node:path')

const { type } = workerData ?? {}

class Logging {
  constructor({ level, basePath }) {
    this.basePath = basePath
    this.level = level
  }

  createFileLogger(name, level = this.level) {
    const path = join(this.basePath, name) + '.log'

    parentPort.postMessage({ message: WorkerMessage.CreateLog, path, name })

    function write(log) {
      parentPort.postMessage({ message: WorkerMessage.Log, name, log })
    }

    return pino(
      {
        formatters: {
          level: (label) => {
            return {
              level: label,
            }
          },
        },
        level,
        timestamp: stdTimeFunctions.isoTime,
        base: {
          workerId: threadId,
          workerType: type,
        },
      },
      { write }
    )
  }
}

class LoggingBuffer {
  constructor() {
    this.buffer = []
    this.writing = false
    this.logs = new Map()
  }

  write(entry) {
    this.buffer.push(entry)

    const write = (force = false) => {
      if ((force || !this.writing) && this.buffer.length) {
        const buffer = [...this.buffer]
        this.buffer = []
        this.writing = true

        for (const { log, name } of buffer) {
          const stream = this.logs.get(name)
          stream.write(log, (err) => {
            if (err) console.error(err)
            else {
              if (this.buffer.length) write(true)
              else this.writing = false
            }
          })
        }
      }
    }

    write()
  }

  create({ name, path }) {
    if (!this.logs.has(name)) {
      try {
        mkdirSync(dirname(path), { recursive: true })
      } catch {}

      this.logs.set(name, createWriteStream(path, { flags: 'a' }))
    }
  }
}

module.exports = { Logging, LoggingBuffer }
