const { randomUUID } = require('node:crypto')
const { join } = require('node:path')
const { EventEmitter } = require('node:events')
const {
  isMainThread,
  parentPort,
  workerData,
  threadId,
} = require('node:worker_threads')
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
const { Cache } = require('./core/cache')
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
    this.cache = new Cache(this)

    this.config = new Config(path('config'), this)
    this.db = new Db(path('db'), this)
    this.lib = new Lib(path('lib'), this)
    this.services = new Services(path('services'), this)
    this.tasks = new Tasks(path('tasks'), this)
    this.api = new Api(path('api'), this)

    this.on('neemata.task-request', this.onTaskRequest.bind(this))
    this.on('neemata.shutdown', this.onShutdown.bind(this))
    this.on('neemata.reload', this.onReload.bind(this))
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
    const _start = async () => {
      await this.redis.connect()
      await this.load()
      await this.executeHook('startup')
    }

    this.ready = new Promise((r) => _start().then(r))

    await this.ready

    if (port) {
      this.server = new Server({ port }, this)
      return this.server.listen()
    }

    // Resolve promise only on shutdown - meanwhile awating for incomming task-execution requests
    return new Promise((r) => {
      this.on('shutdown', r)
    })
  }

  async executeHook(hookName, ...args) {
    try {
      for (const hook of this.hooks[hookName]) {
        await hook(...args)
      }
    } catch (error) {
      this.console.exception(error)
    }
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
        isApi: typeof port !== 'undefined' && port !== null,
        workerId: threadId,
        cache: this.cache,
        redis: this.redis,
        invokeTask: async (task, ...args) => {
          if (port) {
            this.console.debug(`Invoking task "${task}"`, 'App')
            return new Promise((resolve, reject) => {
              const taskReqId = randomUUID()

              const handler = (opts) => {
                if (taskReqId === opts.taskReqId) {
                  this.off('neemata.task-response', handler)
                  const { error, response } = opts.data
                  !error ? resolve(response) : reject(new Error(response))
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

    sandbox.config = this.config.sandbox
    sandbox.db = this.db.sandbox
    sandbox.lib = this.lib.sandbox
    sandbox.services = this.services.sandbox

    this.sandbox = sandbox
  }

  async task(task, ...args) {
    try {
      const taskHandler = this.tasks.get(task)
      if (!taskHandler) {
        throw new Error(`Task not found ${task}`)
      }
      const response = await timeout(
        (async () => taskHandler(...args))(),
        this.appConfig.timeouts.task,
        new Error('Task execution timeout')
      )
      return { error: false, response }
    } catch (error) {
      this.console.exception(error)
      return { error: true, response: error.message ?? 'Error while execution' }
    }
  }

  async onTaskRequest({ taskReqId, task, args }) {
    this.console.debug(`Executing a task ${task}...`)
    await this.ready
    const data = await this.task(task, ...args)
    parentPort.postMessage({ event: 'task-response', taskReqId, data })
  }

  async onShutdown() {
    parentPort.close()
    await this.server?.close()
    await this.executeHook('shutdown')
    await this.redis.disconnect()
    this.emit('shutdown')
    setTimeout(() => process.exit(0), 1000)
  }

  async onReload() {
    await this.executeHook('shutdown')
    for (const hookSet of Object.values(this.hooks)) {
      hookSet.clear()
    }
    // clear require cache
    require.cache = {}
    await this.load()
    await this.executeHook('startup')
    this.emit('reload')
  }
}

const application = new Application()

parentPort.on('message', ({ event, ...args }) => {
  application.emit(`neemata.${event}`, args)
})

application.start().catch((err) => {
  application.console.error('Unable to start a application worker', 'Worker')
  application.console.exception(err)
})

process.on('uncaughtException', function (err) {
  application.console.error('Uncaught application worker exception', 'Worker')
  application.console.exception(err)
})
