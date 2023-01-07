'use strict'

const { Worker } = require('node:worker_threads')

const { Config } = require('./config')
const { WorkerMessage, WorkerType } = require('@neemata/common')
const { Pool } = require('./pool')
const { Watcher } = require('./watcher')
const { LoggingBuffer } = require('./logging')

const { Scheduler } = require('./scheduler')
const { ConsoleLogger } = require('./console')
const { join } = require('node:path')
const { Typings } = require('./typings')

class Neemata {
  /**
   * @type {Pool<Worker>}
   */
  workerPool
  /**
   * @type {null | Promise<void>}
   */
  shutting = null
  /**
   * @type {null | Promise<void>}
   */
  starting = null

  constructor({
    rootPath,
    configPath,
    isDev,
    isProd,
    isOneOff,
    startScheduler,
  }) {
    this.isDev = isDev
    this.isProd = isProd
    this.isOneOff = isOneOff
    this.rootPath = rootPath
    this.startScheduler = startScheduler ?? isProd
    this.config = new Config(configPath)
    this.log = new LoggingBuffer()
  }

  reload() {
    for (const worker of this.workerPool.items) {
      worker.postMessage({ message: WorkerMessage.Reload })
    }
  }

  init() {
    this.console = new ConsoleLogger(this.config.resolved.log.level, 'Neemata')

    this.console.info('Initializing Neemata application server...')

    this.console.debug('Creating a worker pool')
    this.workerPool = new Pool({
      timeout: this.config.resolved.timeouts.task.allocation,
    })

    this.hrm = new Watcher({
      recursive: true,
      path: this.rootPath,
      timeout: this.config.resolved.timeouts.hrm,
    })

    this.scheduler = new Scheduler(this.config.resolved.scheduler)

    this.typings = new Typings(this.rootPath)
  }

  async startup() {
    if (this.starting) return this.starting

    this.init()

    if (this.isDev && !this.isOneOff) {
      this.console.debug('Watching config')
      this.config.on('change', this.restart.bind(this))
      this.config.watch()

      this.console.debug('Watching application')
      this.hrm.on('change', (files) => {
        const sep = '\n    - '
        this.console.debug(
          sep + files.map((f) => `${f.eventType}: ${f.filename}`).join(sep),
          'Hot reload'
        )
        this.typings.compile()
        this.reload()
      })
      this.hrm.watch()
      this.typings.compile()
    }

    if (this.startScheduler) {
      this.console.debug('Starting scheduler')
      this.scheduler.start()
      this.scheduler.on('task', ({ task, name, timeout, args }) => {
        this.console.debug(`Spinning up task execution worker`, 'Scheduler')
        const worker = this.createWorker(WorkerType.OneOff)
        this.console.info(
          `Executing scheduled "${name}" task (${task})`,
          'Scheduler'
        )
        worker.once(WorkerMessage.Result, ({ error, data }) => {
          if (error) {
            this.console.error(
              `Scheduled "${name}" task (${task}) failed: ${data}`
            )
          } else {
            this.console.info(
              `Scheduled "${name}" task (${task}) successfully finished`,
              'Scheduler'
            )
          }
          worker.postMessage({ message: WorkerMessage.Shutdown })
        })
        worker.once(WorkerMessage.Startup, () => {
          worker.postMessage({
            message: WorkerMessage.Invoke,
            task,
            args,
            timeout: timeout || 0,
          })
        })
        worker.postMessage({
          message: WorkerMessage.Startup,
        })
      })
    }

    this.console.info('Spinning up API workers...')
    for (const port of this.config.resolved.ports) {
      this.createWorker(WorkerType.Api, { port })
    }

    this.console.info('Spinning up Task workers...')
    for (let i = 0; i < this.config.resolved.workers; i++) {
      this.createWorker(WorkerType.Task)
    }

    return (this.starting = new Promise(async (resolve) => {
      for (const worker of this.workerPool.items) {
        worker.once(WorkerMessage.Startup, () => {
          if (
            !Array.from(this.workerPool.items).find((worker) => !worker.ready)
          ) {
            resolve()
            this.starting = null
          }
        })
        worker.postMessage({ message: WorkerMessage.Startup })
      }
    }))
  }

  async shutdown() {
    if (this.shutting) return this.shutting

    this.console.info('Shutting down...')

    if (this.isDev && !this.isOneOff) {
      this.console.debug('Clearing application and config')
      this.config.stop()
      this.hrm.stop()
    }

    // Await for all workers to shutdown
    return (this.shutting = new Promise((resolve) => {
      for (const worker of this.workerPool.items) {
        worker.once('exit', () => {
          if (this.workerPool.size === 0) {
            resolve()
            this.shutting = null
          }
        })
        worker.postMessage({ message: WorkerMessage.Shutdown })
      }
    }))
  }

  async restart() {
    await this.shutdown()
    this.init()
    await this.startup()
  }

  async run(task, timeout = 0, ...args) {
    this.init()
    const worker = this.createWorker(WorkerType.OneOff)
    worker.postMessage({ message: WorkerMessage.Startup })
    return new Promise((resolve) => {
      worker.once(WorkerMessage.Startup, () => {
        worker.once(WorkerMessage.Result, ({ error, data }) => {
          if (error) this.console.error(`Command failed: ${data}`)
          else this.console.info(`Command done succesfully`)
          this.shutdown().then(resolve)
        })
        this.console.info(`Executing "${task}"`)
        worker.postMessage({
          message: WorkerMessage.Invoke,
          task,
          timeout,
          args,
        })
      })
    })
  }

  /**
   * @param {import('@neemata/common').WorkerType} type
   * @param [any] workerData
   */
  createWorker(type, workerData = {}) {
    this.console.debug(`Creating ${type} worker`)
    const worker = new Worker(join(__dirname, 'application.js'), {
      workerData: {
        isDev: this.isDev,
        isProd: this.isProd,
        config: this.config.resolved,
        rootPath: this.rootPath,
        type,
        ...workerData,
      },
      env: process.env,
      execArgv: [
        '--no-warnings',
        '--experimental-vm-modules',
        ...process.execArgv,
      ],
    })

    this.workerPool.add(worker, type !== WorkerType.Task)

    worker.on('message', ({ message, ...data }) => worker.emit(message, data))
    worker.on(WorkerMessage.CreateLog, (data) => this.log.create(data))
    worker.on(WorkerMessage.Log, (data) => this.log.write(data))
    worker.once(WorkerMessage.Startup, () => (worker.ready = true))
    worker.once('exit', () => {
      if (!this.workerPool.isFree(worker)) this.workerPool.release(worker)
      this.workerPool.remove(worker)
      // Restart worker, if went down for some reason
      if (!this.shutting && type !== WorkerType.OneOff)
        this.createWorker(type, workerData)
    })

    if (type !== WorkerType.Task) {
      worker.on(WorkerMessage.Invoke, async (task) => {
        const { id } = task
        const executer = await this.workerPool.next(0) // TODO: add allocation timeout
        const handler = (result) => {
          if (id !== result.id) return
          executer.off(WorkerMessage.Result, handler)
          worker.postMessage({ message: WorkerMessage.Result, ...result })
        }
        executer.on(WorkerMessage.Result, handler)
        executer.postMessage({ message: WorkerMessage.Invoke, ...task })
      })
    }

    return worker
  }
}

module.exports = { Neemata }
