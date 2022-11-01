'use strict'

const { EventEmitter } = require('node:events')
const { workerData, parentPort, threadId } = require('node:worker_threads')
const { randomUUID } = require('node:crypto')

const { Config } = require('./modules/config')
const { WorkerMessage, WorkerType } = require('./enums')
const { Logging } = require('./logging')
const { Db } = require('./modules/db')
const { Lib } = require('./modules/lib')
const { Services } = require('./modules/services')
const { Tasks } = require('./modules/tasks')
const { Api } = require('./modules/api')
const { Server } = require('./server')
const { ConsoleLogger } = require('./console')

/**
 * @type {{type: keyof typeof import('./enums').WorkerType, port?: number, isDev: boolean, isDev: boolean, isProd: boolean, config: import('../types/neemata').NeemataConfig, rootPath: string}}
 */
const { type, port, isDev, isProd, config, rootPath } = workerData

class UserApplication {
  /**
   *
   * @param {WorkerApplication} app
   */
  constructor(app) {
    this.type = type
    this.invoke = app.invoke.bind(app)
    this.clients = app.server?.clients
    this.workerId = threadId
    this.createFileLogger = app.logging.createFileLogger.bind(app.logging)
  }
}

class WorkerApplication extends EventEmitter {
  constructor() {
    super()
    this.setMaxListeners(0)

    this.isDev = isDev
    this.isProd = isProd
    this.rootPath = rootPath
    this.config = config

    this.logging = new Logging(this.config.log)
    this.console = new ConsoleLogger(this.config.log.level, 'Application')

    this.modules = {
      config: new Config(this),
      db: new Db(this),
      lib: new Lib(this),
      services: new Services(this),
      tasks: new Tasks(this),
      api: new Api(this),
    }

    this.server = type === WorkerType.Api ? new Server(port, this) : null
  }

  createSandbox() {
    this.console.debug('Creating application sandbox')
    this.sandbox = {
      config: this.modules.config.sandbox,
      db: this.modules.db.sandbox,
      lib: this.modules.lib.sandbox,
      services: this.modules.services.sandbox,
      application: new UserApplication(this),
    }
  }

  async initialize() {
    this.hooks = new Map(
      ['startup', 'shutdown', 'connect', 'disconnect', 'request'].map(
        (hook) => [hook, new Set()]
      )
    )

    this.createSandbox()

    // Load modules in order
    for (const module of ['config', 'db', 'lib', 'services']) {
      await this.modules[module].load()
    }

    await this.runHooks('startup')

    await Promise.all([this.modules.api.load(), this.modules.tasks.load()])
  }

  async terminate() {
    await this.runHooks('shutdown')
  }

  async reload() {
    this.console.debug('Reloading')
    await this.terminate()
    await this.initialize()
  }

  async startup() {
    this.console.info('Starting worker application...')
    await this.initialize()

    if (type === WorkerType.Api) {
      const address = await this.server.listen()
      this.console.info(`Listening on ${address}...`)
    } else {
      this.console.info('Waiting for a task...')
      new Promise((r) => this.once(WorkerMessage.Shutdown, r))
    }
  }

  async shutdown() {
    this.console.debug('Shutting worker application')
    if (this.server) await this.server.close()
    await this.terminate()
  }

  async runHooks(hook, concurrently = false, ...args) {
    const hooks = this.hooks.get(hook) ?? []
    if (concurrently) {
      for (const hook of hooks) {
        await hook(...args)
      }
    } else {
      await Promise.all(Array.from(hooks).map((hook) => hook(...args)))
    }
  }

  async runTask(task, timeout, ...args) {
    try {
      task = this.modules.tasks.get(task)
      if (!task) throw new Error('Task not found')
      const result = await Promise.race([
        task(...args),
        timeout
          ? new Promise((_, reject) =>
              setTimeout(
                () => reject(new Error('Task execution timeout')),
                timeout
              )
            )
          : new Promise(() => {}),
      ])
      return { error: false, data: result }
    } catch (error) {
      return { error: true, data: error.message }
    }
  }

  async invoke(taskOrOptions, ...args) {
    const { task, timeout } =
      typeof taskOrOptions === 'string'
        ? { task: taskOrOptions, timeout: this.config.timeouts.task.execution }
        : taskOrOptions

    if (type === WorkerType.Task) {
      // Call invoked task on the same thread, if it's called inside task worker
      const result = await this.runTask(task, timeout, ...args)
      if (result.error) return Promise.reject(new Error(result.data))
      else return Promise.resolve(result.data)
    } else {
      const id = randomUUID()
      return new Promise((resolve, reject) => {
        app.once(id, (result) => {
          if (result.error) reject(new Error(result.data))
          else resolve(result.data)
        })
        parentPort.postMessage({
          message: WorkerMessage.Invoke,
          id,
          task,
          timeout,
          args,
        })
      })
    }
  }
}

const app = new WorkerApplication()

app.on(WorkerMessage.Invoke, async (data) => {
  const { task, id, timeout, args } = data
  const result = await app.runTask(task, timeout, ...args)
  parentPort.postMessage({ message: WorkerMessage.Result, id, ...result })
})

app.on(WorkerMessage.Result, (data) => {
  const { id, ...rest } = data
  app.emit(id, rest)
})

app.once(WorkerMessage.Startup, async () => {
  await app.startup()
  parentPort.postMessage({ message: WorkerMessage.Startup })
})

app.once(WorkerMessage.Shutdown, async () => {
  parentPort.close()
  await app.shutdown()
})

app.on(WorkerMessage.Reload, async () => {
  await app.reload()
  app.emit('reloaded')
})

parentPort.on('message', ({ message, ...data }) => {
  app.emit(message, data)
})

process.on('uncaughtException', (err) => app.console.error(err))
process.on('unhandledRejection', (err) => app.console.error(err))

module.exports = { WorkerApplication, UserApplication }
