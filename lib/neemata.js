const EventEmitter = require('node:events')
const { resolve } = require('node:path')
const { isMainThread, Worker } = require('node:worker_threads')
const { Configuration } = require('./core/configuration')
const { Pool } = require('./core/pool')
const { range } = require('./utils/helpers')
const { Watcher } = require('./utils/watcher')
const { console: _console } = require('./core/console')
const { generateTypings } = require('./core/typings')
const { Scheduler } = require('./core/scheduler')
const { randomUUID } = require('crypto')
const { WorkerEvent } = require('./enums/worker-event')

const isDev = process.env.NODE_ENV !== 'production'
const baseDir = process.cwd() // TODO: make it configurable via cli args

class Neemata extends EventEmitter {
  constructor() {
    if (!isMainThread) throw new Error('Should start on main thread')
    super()
    this.console = _console
    const configuration = new Configuration(resolve(baseDir, 'config.js'))
    this.appConfig = configuration.resolve()
    this.pool = new Pool()
    this.isShuttingDown = false

    if (isDev) {
      this.configurationWatcher = new Watcher({
        path: configuration.path,
        timeout: 2500,
        recursive: false,
      })

      this.configurationWatcher.on('change', () => {
        this.console.info('Neemata config has been changed', 'App')
        try {
          this.appConfig = configuration.resolve()
          this.restart()
        } catch (error) {
          this.console.error(error)
        }
      })

      this.applicationWatcher = new Watcher({
        path: resolve(baseDir, 'application'),
        timeout: this.appConfig.timeouts.watch,
        recursive: true,
      })

      this.applicationWatcher.on('change', (files) => {
        this.console.info('Hot reloading...', 'HotReload')
        this.console.debug(
          'Modules changed: \n' +
            files.map((f) => `${f.filename}: ${f.eventType}`).join('\n'),
          'HotReload'
        )
        this.reload()
      })

      this.configurationWatcher.watch()
      this.applicationWatcher.watch()
    }

    this.typyingsWatcher = generateTypings(baseDir, !isDev)
  }

  /**
   * @type {Set<import('node:worker_threads').Worker>}
   */
  get workers() {
    return new Set([
      ...this.pool.items,
      ...(this.scheduler?.worker ? [this.scheduler?.worker] : []),
    ])
  }

  async startup() {
    this.console.info('Starting up Neemata...', 'App')

    this.scheduler = new Scheduler(this)
    this.scheduler.start()

    // Api workers
    this.console.info('Starting up server workers...', 'App')
    for (const port of this.appConfig.ports) {
      const worker = this.createWorker({ port })
      worker.on('message', async ({ event, ...rest }) => {
        switch (event) {
          case WorkerEvent.TaskInvoke: {
            const executer = await this.pool.next()
            const handler = ({ event, ...rest }) => {
              if (event === WorkerEvent.TaskResponse) {
                executer.off('message', handler)
                worker.postMessage({ event, ...rest })
              }
            }
            executer.on('message', handler)
            executer.postMessage({ event, ...rest })
            break
          }
          case WorkerEvent.ServerPropagateMessage: {
            for (const worker of this.workers) {
              worker.postMessage({ event, ...rest })
            }
          }
        }
      })
      this.pool.add(worker)
      await this.pool.capture(worker)
    }

    // Task workers
    this.console.info('Starting up task workers...', 'App')
    range(this.appConfig.workers - this.appConfig.ports.length, 1)
      .toArray()
      .forEach(() => {
        const worker = this.createWorker()
        this.pool.add(worker)
      })
  }

  async shutdown() {
    if (this.isShuttingDown) return this.isShuttingDown
    this.console.info('Shutting down Neemata...', 'App')
    this.typyingsWatcher?.kill()
    this.scheduler?.stop()
    this.configurationWatcher?.stop()
    this.applicationWatcher?.stop()

    const exited = []
    return (this.isShuttingDown = new Promise((resolve) => {
      for (const worker of this.workers) {
        const threadId = worker.threadId
        worker.postMessage({ event: WorkerEvent.Shutdown })
        const timeout = setTimeout(
          () => worker.terminate(),
          this.appConfig.timeouts.app.shutdown
        )
        worker.on('exit', () => {
          if (timeout) clearTimeout()
          this.console.debug(threadId)
          exited.push(threadId)
          if (exited.length === this.workers.size) {
            this.isShuttingDown = null
            resolve()
          }
        })
      }
    }))
  }

  async restart() {
    this.console.info('Restarting Neemata...', 'App')
    await this.shutdown()
    await this.startup()
  }

  async exec(task, args) {
    return new Promise((r) => {
      this.console.info('Starting neemata executor...', 'App')
      const executor = this.createWorker()
      this.pool.add(executor)
      executor
        .on('online', () => {
          executor.postMessage({
            event: WorkerEvent.TaskInvoke,
            taskReqId: randomUUID(),
            timeout: false,
            task,
            args,
          })
        })
        .on('message', ({ event, ...rest }) => {
          switch (event) {
            case WorkerEvent.TaskResponse: {
              this.console.info('Finished', 'App')
              r()
            }
          }
        })
    })
  }

  reload() {
    for (const worker of this.workers) {
      worker.postMessage({ event: WorkerEvent.Reload })
    }
  }

  createWorker(data = {}) {
    const workerPath = resolve(__dirname, 'application.js')
    const workerData = { isDev, baseDir, appConfig: this.appConfig }
    const env = {
      ...process.env,
      NODE_PATH: `${process.env.NODE_PATH}:${resolve(
        process.cwd(),
        'node_modules'
      )}`,
    }

    const worker = new Worker(workerPath, {
      workerData: { ...workerData, ...data },
      env,
    })

    worker.on('error', this.console.error.bind(this.console))

    return worker
  }
}

module.exports = {
  Neemata,
}
