const { randomUUID } = require('crypto')
const { join } = require('path')
const { EventEmitter } = require('stream')
const { isMainThread, parentPort, workerData } = require('worker_threads')
const { ApiException } = require('./api/exception')
const { Server } = require('./api/server')
const { Api } = require('./app/api')
const { Config } = require('./app/config')
const { Db } = require('./app/db')
const { Lib } = require('./app/lib')
const { Services } = require('./app/services')
const { Tasks } = require('./app/tasks')
const { console: _console } = require('./core/console')
const { Redis } = require('./core/redis')
const { ErrorCode } = require('./enums/error-code')
const { timeout } = require('./utils/helpers')

const { isDev, appConfig, port, baseDir } = workerData

const hooks = ['startup', 'shutdown', 'connection', 'disconnection', 'request']

const path = (...parts) => join(baseDir, 'application', ...parts)

class Application extends EventEmitter {
  constructor() {
    if (isMainThread) throw new Error('Main thread is reserved')

    super()

    this.console = _console
    this.appConfig = appConfig
    this.isDev = isDev
    this.server = null

    this.hooks = Object.fromEntries(hooks.map((hook) => [hook, new Set()]))

    this.redis = new Redis(this)

    this.config = new Config(path('config'), this)
    this.db = new Db(path('db'), this)
    this.lib = new Lib(path('lib'), this)
    this.services = new Services(path('services'), this)
    this.tasks = new Tasks(path('tasks'), this)
    this.api = new Api(path('api'), this)

    this.on('neemata.task-request', (...args) => this.onTaskRequest(...args))
    this.on('neemata.shutdown', (...args) => this.onShutdown(...args))
    this.on('neemata.reload', (...args) => this.onReload(...args))
  }

  async load() {
    this.createSandbox()

    await this.config.load()
    await this.db.load()
    await this.lib.load()
    await this.services.load()
    await this.tasks.load()
    await this.api.load()
  }

  async start() {
    await this.redis.connect()
    await this.load()

    if (port) {
      this.server = new Server({ port }, this)
      return this.server.listen()
    }

    // Resolve promise only on shutdown - meanwhile awating for incomming task-execution requests
    return new Promise((r) => {
      this.on('shutdown', r)
    })
  }

  createSandbox() {
    const define = (value) => value

    const typingHelpers = [
      'defineAuthModule',
      'defineApiModule',
      'defineGuardModule',
      'defineDbModule',
      'defineConnectionHook',
    ]

    const sandbox = {
      ApiException,
      ErrorCode,
      application: {
        task: async (task, ...args) => {
          if (port) {
            this.console.debug(`Invoking task "${task}"`, 'App')
            return new Promise((resolve, reject) => {
              const taskReqId = randomUUID()

              const handler = (opts) => {
                console.dir(opts)
                if (taskReqId === opts.taskReqId) {
                  this.off('neemata.task-response', handler)
                  const { error, response } = opts.data
                  return !error
                    ? resolve(response)
                    : reject(new Error(response))
                }
              }

              this.on('neemata.task-response', handler)

              parentPort.postMessage({
                event: 'task-request',
                taskReqId,
                task,
                args,
              })
            })
          } else {
            const { error, response } = await this.task(task, ...args)
            return !error ? Promise.resolve(response) : Promise.reject(response)
          }
        },
      },

      // Typing helpers
      ...Object.fromEntries(
        typingHelpers.map((name) => [name, define.bind(undefined)])
      ),
    }

    const modules = ['config', 'db', 'lib', 'services', 'api']

    for (const module of modules) {
      Object.defineProperty(sandbox, module, {
        enumerable: true,
        get: () => {
          return this[module].sandbox
        },
      })
    }

    this.sandbox = sandbox
  }

  async task(task, ...args) {
    try {
      const taskHandler = this.tasks.get(task)
      const response = await timeout(
        (() => taskHandler(...args))(),
        this.appConfig.timeouts.task,
        new Error('Task execution timeout')
      )
      return { error: false, response }
    } catch (error) {
      this.console.exception(error)
      return { error: true, response: 'Error while execution' }
    }
  }

  async onTaskRequest({ taskReqId, task, args }) {
    this.console.debug(`Executing a task ${task}...`)
    const data = await this.task(task, ...args)
    parentPort.postMessage({ event: 'task-response', taskReqId, data })
  }

  async onShutdown() {
    if (this.port) {
      await this.server.close()
    }
    this.emit('shutdown')
  }

  async onReload() {
    await this.load()
    this.emit('reload')
  }
}

const application = new Application()

parentPort.on('message', ({ event, ...args }) => {
  application.emit(`neemata.${event}`, args)
})

application.start().catch((err) => {
  application.console.error('Unable to startup a worker', 'Worker')
  application.console.exception(err)
})
