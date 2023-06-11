'use strict'

const { EventEmitter } = require('node:events')
const { randomUUID } = require('node:crypto')
const { Config } = require('./namespaces/config')
const { WorkerMessage, WorkerType, WorkerHook } = require('@neemata/common')
const { Logging } = require('./logging')
const { Db } = require('./namespaces/db')
const { Lib } = require('./namespaces/lib')
const { Services } = require('./namespaces/services')
const { Tasks } = require('./namespaces/tasks')
const { Api } = require('./namespaces/api')
const { Server } = require('./protocol/server')
const { clearVM } = require('./vm')
const { setTimeout } = require('node:timers/promises')
const { SEPARATOR } = require('./loader')
const { unique } = require('./utils/functions')

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
    return this.#app.server?.wsClients
  }

  get worker() {
    return this.#worker
  }

  invoke(...args) {
    return this.#app.invoke(...args)
  }

  createFileLogger(...args) {
    return this.#app.logging.createFileLogger(...args)
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

    this.namespaces = {
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
      lib: this.namespaces.lib.sandbox,
      config: this.namespaces.config.sandbox,
      db: this.namespaces.db.sandbox,
      services: this.namespaces.services.sandbox,
      application: new UserApplication(this),
      dependency: async (...names) => {
        for (const name of unique(names)) {
          const [namespaceName, ...parts] = name.split(SEPARATOR)
          const moduleName = parts.join(SEPARATOR)
          if (!['db', 'config', 'services', 'lib'].includes(namespaceName))
            throw new Error(
              `Unabled to inject modules from "${namespaceName}" namespace`
            )
          const namespace = this.namespaces[namespaceName]
          if (!namespace.entries.has(moduleName))
            throw new Error(
              `Module "${moduleName}" in "${namespaceName}" namespace is not found`
            )

          const filePath = namespace.entries.get(moduleName)
          await namespace.loadModule(moduleName, filePath)
        }
      },
    }
  }

  async initialize() {
    this.hooks = new Map(
      Object.values(WorkerHook).map((hook) => [hook, new Set()])
    )

    this.createSandbox()

    await Promise.all(
      Object.values(this.namespaces).map((module) => module.preload())
    )

    // Load namespaces in order
    for (const module of ['lib', 'config', 'db', 'services']) {
      await this.namespaces[module].load()
    }

    await this.runHooks(WorkerHook.Startup, false)

    await Promise.all(
      ['api', 'tasks'].map((module) => this.namespaces[module].load())
    )
  }

  async terminate() {
    await this.runHooks(WorkerHook.Shutdown, false)
  }

  async reload() {
    logger.debug('Reloading')
    await this.terminate()
    for (const module of Object.values(this.namespaces)) module.clear()
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

  async runHooks(hookType, concurrently = true, ...args) {
    const hooks = Array.from(this.hooks.get(hookType) ?? new Set())
    if (hookType === WorkerHook.Shutdown) hooks.reverse()
    if (!concurrently) {
      for (const hook of hooks) await hook(...args)
    } else {
      await Promise.all(hooks.map((hook) => hook(...args)))
    }
  }

  async runTask(task, timeout, ...args) {
    try {
      task = this.namespaces.tasks.get(task)
      if (!task) throw new Error('Task not found')
      const result = timeout
        ? await Promise.race([
          task(...args),
          setTimeout(timeout, new Error('Task execution timeout')),
        ])
        : await task(...args)
      if (result instanceof Error) throw result
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

    if (this.type !== WorkerType.Api) {
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
