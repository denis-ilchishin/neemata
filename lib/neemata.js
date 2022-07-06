const EventEmitter = require('events')
const { join } = require('path')
const { isMainThread, Worker } = require('worker_threads')
const { Configuration } = require('./core/configuration')
const { Pool } = require('./core/pool')
const { range } = require('./utils/helpers')
const { Watcher } = require('./utils/watcher')
const { console: _console } = require('./core/console')
const { genTypings } = require('./core/typings')
const { Scheduler } = require('./core/scheduler')

const isDev = process.env.NODE_ENV !== 'production'
const baseDir = process.cwd()

class Neemata extends EventEmitter {
  constructor() {
    if (!isMainThread) throw new Error('Main thread is reserved')

    super()

    this.console = _console

    const configuration = new Configuration({
      path: join(baseDir, 'config'),
      isDev,
    })
    this.appConfig = configuration.resolve()
    this.pool = new Pool()

    if (isDev) {
      configuration.on('change', () => {
        try {
          this.appConfig = configuration.resolve()
          this.restart()
        } catch (error) {
          this.console.error(error)
        }
      })

      this.watcher = new Watcher({
        path: join(baseDir, 'application'),
        timeout: this.appConfig.timeouts.watch,
        recursive: true,
      })

      this.watcher.on('change', (files) => {
        this.console.debug('Files changed: ' + files, 'HotReload')
        this.console.info('Hot reloading...', 'HotReload')
        this.reload()
      })
    }

    genTypings(baseDir, !isDev)
  }

  get workers() {
    return [...this.pool.items, ...[this.scheduler?.worker ?? []]]
  }

  async startup() {
    this.console.info('Starting up neemata application...', 'App')

    this.scheduler = new Scheduler(this)
    this.scheduler.start()

    // server workers
    this.console.info('Starting up server workers...', 'App')
    for (const port of this.appConfig.ports) {
      const worker = this.createWorker({ port })
      worker.on('message', async ({ event, ...rest }) => {
        switch (event) {
          case 'task-request': {
            const executer = await this.pool.next()

            const handler = ({ event, ...rest }) => {
              if (event === 'task-response') {
                executer.off('message', handler)
                worker.postMessage({ event, ...rest })
              }
            }
            executer.on('message', handler)
            executer.postMessage({ event, ...rest })
          }
        }
      })
      this.pool.add(worker)
      await this.pool.capture(worker)
    }

    // task workers
    this.console.info('Starting up task workers...', 'App')
    for (const i of range(
      this.appConfig.workers - this.appConfig.ports.length,
      1
    )) {
      const worker = this.createWorker()
      this.pool.add(worker)
    }

    if (isDev) {
      this.console.info('Starting application hot reload...', 'App')
      this.watcher.watch()
    }
  }

  async shutdown() {
    this.console.info('Shuttind down neemata application...', 'App')
    this.scheduler.stop()

    for (const worker of this.workers) {
      worker.postMessage({ event: 'shutdown' })
      setTimeout(() => worker.terminate(), this.appConfig.timeouts.app.shutdown)
    }
  }

  async restart() {
    await this.shutdown()
    await this.startup()
  }

  reload() {
    for (const worker of this.workers) {
      worker.postMessage({ event: 'reload' })
    }
  }

  createWorker(data = {}) {
    const workerPath = join(__dirname, 'application.js')
    const workerData = { isDev, baseDir, appConfig: this.appConfig }
    const env = {
      ...process.env,
      NODE_PATH: `${process.env.NODE_PATH}:${join(baseDir, 'node_modules')}`,
    }
    return new Worker(workerPath, {
      workerData: { ...workerData, ...data },
      env,
    })
  }
}

module.exports = {
  Neemata,
}
