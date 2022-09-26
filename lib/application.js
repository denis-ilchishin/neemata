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
const { ErrorCode } = require('./enums/error-code')
const { timeout } = require('./utils/helpers')
const { WorkerEvent } = require('./enums/worker-event')

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

    if (this.appConfig.redis?.subscriber) {
      const { Subscriber } = require('./core/subscriber')
      this.subscriber = new Subscriber(this)
    }

    if (this.appConfig.redis?.cache) {
      const { Cache } = require('./core/cache')
      this.cache = new Cache(this)
    }

    this.config = new Config(path('config'), this)
    this.db = new Db(path('db'), this)
    this.lib = new Lib(path('lib'), this)
    this.services = new Services(path('services'), this)
    this.tasks = new Tasks(path('tasks'), this)
    this.api = new Api(path('api'), this)

    this.on(`neemata:${WorkerEvent.Shutdown}`, this.onShutdown.bind(this))
    this.on(`neemata:${WorkerEvent.Reload}`, this.onReload.bind(this))
    this.on(
      `neemata:${WorkerEvent.TaskInvoke}`,
      this.onReceivedTaskInvoke.bind(this)
    )
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
      await Promise.all([this.subscriber?._connect(), this.cache?._connect()])
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
      'defineGuard',
      'defineConnectionHook',
    ]

    const sandbox = {
      ApiException,
      ErrorCode,
      config: this.config.sandbox,
      db: this.db.sandbox,
      lib: this.lib.sandbox,
      services: this.services.sandbox,
      application: {
        isApi: typeof port !== 'undefined' && port !== null,
        workerId: threadId,
        invokeTask: this.invokeTask.bind(this),
        subscriber: this.subscriber,
        cache: this.cache,
      },
      // Typing helpers
      ...Object.fromEntries(
        typingHelpers.map((name) => [name, define.bind(undefined)])
      ),
    }

    this.sandbox = sandbox
  }

  async invokeTask(taskOrOptions, ...args) {
    const { task, timeout = this.appConfig.timeouts.task } =
      typeof taskOrOptions === 'string'
        ? { task: taskOrOptions }
        : taskOrOptions

    if (parseFloat(timeout) <= 0)
      throw new Error('Task must have timeout specified')

    if (port) {
      this.console.debug(`Invoking task [${task}]`, 'App')
      return new Promise((resolve, reject) => {
        const taskReqId = randomUUID()

        const handler = (opts) => {
          if (taskReqId === opts.taskReqId) {
            this.off(`neemata:${WorkerEvent.TaskResponse}`, handler)
            const { error, response } = opts.data
            if (error) reject(new Error(response))
            else resolve(response)
          }
        }

        this.on(`neemata:${WorkerEvent.TaskResponse}`, handler)

        parentPort.postMessage({
          event: WorkerEvent.TaskInvoke,
          taskReqId,
          task,
          timeout,
          args,
        })
      })
    } else {
      const { error, response } = await this.executeTask(task, timeout, ...args)
      return !error ? Promise.resolve(response) : Promise.reject(response)
    }
  }

  async executeTask(task, taskTimeout, ...args) {
    try {
      const taskHandler = this.tasks.get(task)
      if (!taskHandler) {
        throw new Error(`Task not found ${task}`)
      }

      const response = taskTimeout
        ? await timeout(
            taskHandler(...args),
            taskTimeout,
            new Error('Task execution timeout')
          )
        : await taskHandler(...args)

      return { error: false, response }
    } catch (error) {
      this.console.exception(error)
      return {
        error: true,
        response: error.message ?? 'Error while task execution',
      }
    }
  }

  async onReceivedTaskInvoke({ taskReqId, task, timeout, args }) {
    this.console.debug(`Executing a task [${task}]...`, 'App')
    await this.ready
    const data = await this.executeTask(task, timeout, ...args)
    parentPort.postMessage({ event: WorkerEvent.TaskResponse, taskReqId, data })
    this.console.debug(`Task [${task}] has finished`, 'App')
  }

  async onShutdown() {
    parentPort.close()
    await this.server?.close()
    await this.executeHook('shutdown')
    await Promise.all([
      this.subscriber?._disconnect(),
      this.cache?._disconnect(),
    ])
    this.emit('shutdown')
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
  application.emit(`neemata:${event}`, args)
})

application.start().catch((err) => {
  application.console.error('Unable to start a application worker', 'Worker')
  application.console.exception(err)
})

process.on('uncaughtException', function (err) {
  application.console.error('Uncaught application worker exception', 'Worker')
  application.console.exception(err)
})
