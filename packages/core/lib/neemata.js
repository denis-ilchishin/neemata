'use strict'

const { Worker } = require('node:worker_threads')
const { join } = require('node:path')

const { WorkerMessage, WorkerType } = require('@neemata/common')
const { Pool } = require('./utils/pool')
const { Watcher } = require('./utils/watcher')
const { LoggingBuffer } = require('./logging')
const { Scheduler } = require('./scheduler')
const { Typings } = require('./typings')

class Neemata {
  constructor({ rootPath, config, isDev, isProd, isOneOff, startScheduler }) {
    this.isDev = isDev
    this.isProd = isProd
    this.isOneOff = isOneOff
    this.rootPath = rootPath
    this.startScheduler = startScheduler ?? isProd
    this.config = config
    this.log = new LoggingBuffer()
  }

  reload() {
    for (const worker of this.workerPool.items) {
      worker.postMessage({ message: WorkerMessage.Reload })
    }
  }

  init() {
    logger.info('Initializing Neemata application server...')
    logger.debug('Creating a worker pool')
    this.workerPool = new Pool({
      timeout: this.config.resolved.timeouts.task.allocation,
    })
    this.hmr = new Watcher({
      recursive: true,
      path: this.rootPath,
      timeout: this.config.resolved.timeouts.hmr,
    })
    this.scheduler = new Scheduler(this.config.resolved.scheduler)
    this.typings = new Typings(this.rootPath)
  }

  async startup() {
    if (this.starting) return this.starting

    this.init()

    if (this.isDev && !this.isOneOff) {
      logger.debug('Watching config')
      this.config.on('change', this.restart.bind(this))
      this.config.watch()

      logger.debug('Watching application')
      this.hmr.on('change', (files) => {
        const sep = '\n    - '
        logger.debug(
          sep + files.map((f) => `${f.eventType}: ${f.filename}`).join(sep),
          'Hot reload'
        )
        this.typings.compile()
        this.reload()
      })
      this.hmr.watch()
      this.typings.compile()
    }

    if (this.startScheduler) {
      logger.debug('Starting scheduler')
      this.scheduler.start()
      this.scheduler.on('task', ({ task, name, timeout, args }) => {
        logger.debug(`Spinning up task execution worker`, 'Scheduler')
        const worker = this.createWorker(WorkerType.OneOff)
        logger.info(`Executing scheduled "${name}" task (${task})`, 'Scheduler')
        worker.once(WorkerMessage.Result, ({ error, data }) => {
          if (error) {
            logger.error(`Scheduled "${name}" task (${task}) failed: ${data}`)
          } else {
            logger.info(
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

    logger.info('Spinning up API workers...')
    for (const port of this.config.resolved.ports) {
      this.createWorker(WorkerType.Api, { port })
    }

    logger.info('Spinning up Task workers...')
    for (let i = 0; i < this.config.resolved.workers; i++) {
      this.createWorker(WorkerType.Task)
    }

    return (this.starting = new Promise(async (resolve) => {
      for (const worker of this.workerPool.items) {
        worker.once(WorkerMessage.Startup, () => {
          const ready = !Array.from(this.workerPool.items).find(
            (worker) => !worker.ready
          )
          if (ready) {
            resolve()
            this.starting = undefined
          }
        })
        worker.postMessage({ message: WorkerMessage.Startup })
      }
    }))
  }

  async shutdown() {
    if (this.shutting) return this.shutting

    logger.info('Shutting down...')

    if (this.isDev && !this.isOneOff) {
      logger.debug('Clearing application and config')
      this.config.stop()
      this.hmr.stop()
    }

    // Await for all workers to shutdown
    return (this.shutting = new Promise((resolve) => {
      for (const worker of this.workerPool.items) {
        worker.once('exit', () => {
          if (this.workerPool.size === 0) {
            resolve()
            this.shutting = undefined
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
          if (error) logger.error(`Command failed: ${data}`)
          else logger.info(`Command done succesfully`)
          this.shutdown().then(resolve)
        })
        logger.info(`Executing "${task}"`)
        worker.postMessage({
          message: WorkerMessage.Invoke,
          task,
          timeout,
          args,
        })
      })
    })
  }

  createWorker(type, workerData = {}) {
    logger.debug(`Creating ${type} worker`)
    const worker = new Worker(join(__dirname, 'worker.js'), {
      workerData: {
        isDev: this.isDev,
        isProd: this.isProd,
        config: this.config.resolved,
        rootPath: this.rootPath,
        workerId: this.workerPool.size + 1,
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

    if (type === WorkerType.Api) {
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
