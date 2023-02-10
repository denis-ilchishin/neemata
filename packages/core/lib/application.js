'use strict'

const { EventEmitter } = require('node:events')
const { randomUUID } = require('node:crypto')
const { Config } = require('./modules/config')
const { WorkerMessage, WorkerType, WorkerHook } = require('@neemata/common')
const { Logging } = require('./logging')
const { Db } = require('./modules/db')
const { Lib } = require('./modules/lib')
const { Services } = require('./modules/services')
const { Tasks } = require('./modules/tasks')
const { Api } = require('./modules/api')
const { Server } = require('./protocol/server')
const { ConsoleLogger } = require('./console')
const { clearVM } = require('./vm')

class UserApplication {
  #app
  #worker

  constructor(app) {
    const { workerId, threadId, type } = app

    this.#app = app
    this.#worker = Object.freeze({
      workerId,
      threadId,
      type,
    })
  }

  get clients() {
    return this.#app.server?.clients
  }

  get worker() {
    return this.#worker
  }

  invoke(...args) {
    return this.#app.invoke(...args)
  }

  createFileLogger(...args) {
    return app.logging.createFileLogger(...args)
  }
}

class WorkerApplication extends EventEmitter {
  constructor({
    type,
    port,
    isDev,
    isProd,
    config,
    rootPath,
    workerId,
    threadId,
  }) {
    super()
    this.setMaxListeners(0)

    this.type = type
    this.threadId = threadId
    this.workerId = workerId
    this.isDev = isDev
    this.isProd = isProd
    this.rootPath = rootPath
    this.config = config

    this.logging = new Logging(this.config.log)

    this.modules = {
      lib: new Lib(this),
      config: new Config(this),
      db: new Db(this),
      services: new Services(this),
      tasks: new Tasks(this),
      api: new Api(this),
    }

    this.server = type === WorkerType.Api ? new Server(port, this) : null
  }

  createSandbox() {
    logger.debug('Creating application sandbox')
    clearVM()
    this.sandbox = {
      lib: this.modules.lib.sandbox,
      config: this.modules.config.sandbox,
      db: this.modules.db.sandbox,
      services: this.modules.services.sandbox,
      application: new UserApplication(this),
    }
  }

  async initialize() {
    this.hooks = new Map(
      Object.values(WorkerHook).map((hook) => [hook, new Set()])
    )

    this.createSandbox()

    // Load modules in order
    for (const module of ['lib', 'config', 'db', 'services']) {
      await this.modules[module].load()
    }

    await this.runHooks(WorkerHook.Startup)

    await Promise.all(
      ['api', 'tasks'].map((module) => this.modules[module].load())
    )
  }

  async terminate() {
    await this.runHooks(WorkerHook.Shutdown)
  }

  async reload() {
    logger.debug('Reloading')
    await this.terminate()
    await this.initialize()
  }

  async startup() {
    logger.info('Starting worker application...')
    await this.initialize()

    // Api worker start the server, other workers wait for a incomming tasks
    if (this.server) {
      const address = await this.server.listen()
      logger.info(`Listening on ${address}...`)
    } else {
      logger.info('Waiting for a task...')
      new Promise((r) => this.once(WorkerMessage.Shutdown, r))
    }
  }

  async shutdown() {
    logger.debug('Shutting worker application')
    if (this.server) await this.server.close()
    await this.terminate()
  }

  async runHooks(hookType, concurrently = false, ...args) {
    const hooks = this.hooks.get(hookType) ?? new Set()
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
      return { error: true, data: error.stack || error.message }
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
        this.once(id, (result) => {
          if (result.error) reject(new Error(result.data))
          else resolve(result.data)
        })
        this.emit(WorkerMessage.Invoke + WorkerMessage.Result, {
          id,
          task,
          timeout,
          args,
        })
      })
    }
  }
}

module.exports = { WorkerApplication, UserApplication }
