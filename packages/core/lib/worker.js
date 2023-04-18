'use strict'

const { parentPort, workerData, threadId } = require('node:worker_threads')
const { WorkerMessage, WorkerType } = require('@neemata/common')
const { ConsoleLogger } = require('./console')
const { EventEmitter } = require('node:events')

const { Logging } = require('./logging')
const { Server } = require('./protocol/server')
const { DependencyContainer } = require('./di')
const loader = require('esbuild-register/dist/node')
const { UserApplication } = require('./application')
const { join } = require('node:path')

loader.register({
  platform: 'node',
  target: 'es2022',
  format: 'cjs',
  ignoreAnnotations: true,
  minify: false,
})

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
    this.container = new DependencyContainer(this)

    this.server = type === WorkerType.Api ? new Server(port, this) : null
  }

  async initialize() {
    await this.container.load()
    await this.loadApp()
  }

  async terminate() {
    // await this.runHooks(this.entry.hooks[WorkerHook.Shutdown])
  }

  async loadApp() {
    const app = await import(join(this.rootPath, this.config.entry)).then(
      (m) => m.default.default
    )

    if (!(app instanceof UserApplication))
      throw new Error('Application type is invalid')
    this.userApp = app

    if (this.userApp.auth) {
      if (!this.container._registry.has(this.userApp.auth)) {
        throw new Error('Auth provider not found')
      }
    }
  }

  async reload() {
    logger.debug('Reloading')
    await this.terminate()
    // for (const module of Object.values(this.namespaces)) module.clear()
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

  // async runHooks(hookType, concurrently = true, ...args) {
  //   const hooks = this.hooks.get(hookType) ?? new Set()
  //   if (!concurrently) {
  //     for (const hook of hooks) await hook(...args)
  //   } else {
  //     await Promise.all(Array.from(hooks).map((hook) => hook(...args)))
  //   }
  // }

  // async runTask(task, timeout, ...args) {
  //   try {
  //     task = this.namespaces.tasks.get(task)
  //     if (!task) throw new Error('Task not found')
  //     const result = timeout
  //       ? await Promise.race([
  //           task(...args),
  //           setTimeout(timeout, new Error('Task execution timeout')),
  //         ])
  //       : await task(...args)
  //     if (result instanceof Error) throw result
  //     return { error: false, data: result }
  //   } catch (error) {
  //     return { error: true, data: error.stack || error.message }
  //   }
  // }

  // async invoke(taskOrOptions, ...args) {
  //   const { task, timeout } =
  //     typeof taskOrOptions === 'string'
  //       ? { task: taskOrOptions, timeout: this.config.timeouts.task.execution }
  //       : taskOrOptions

  //   if (this.type !== WorkerType.Api) {
  //     // Call invoked task on the same thread, if it's called inside task worker
  //     const result = await this.runTask(task, timeout, ...args)
  //     if (result.error) return Promise.reject(new Error(result.data))
  //     else return Promise.resolve(result.data)
  //   } else {
  //     const id = randomUUID()
  //     return new Promise((resolve, reject) => {
  //       this.once(id, (result) => {
  //         if (result.error) reject(new Error(result.data))
  //         else resolve(result.data)
  //       })
  //       this.emit(WorkerMessage.Invoke + WorkerMessage.Result, {
  //         id,
  //         task,
  //         timeout,
  //         args,
  //       })
  //     })
  //   }
  // }
}

const logLevel = workerData.config.log.level
globalThis.logger = new ConsoleLogger(logLevel, 'Worker')

const workerApp = new WorkerApplication({ ...workerData, threadId })

workerApp.on(WorkerMessage.Invoke, async (data) => {
  const { task, id, timeout, args } = data
  const result = await workerApp.runTask(task, timeout, ...args)
  parentPort.postMessage({ message: WorkerMessage.Result, id, ...result })
})

workerApp.on(WorkerMessage.Result, (data) => {
  const { id, ...rest } = data
  workerApp.emit(id, rest)
})

workerApp.on(WorkerMessage.Invoke + WorkerMessage.Result, (data) => {
  parentPort.postMessage({
    message: WorkerMessage.Invoke,
    ...data,
  })
})

workerApp.once(WorkerMessage.Startup, async () => {
  await workerApp.startup()
  parentPort.postMessage({ message: WorkerMessage.Startup })
})

workerApp.once(WorkerMessage.Shutdown, async () => {
  parentPort.close()
  await workerApp.shutdown().finally(() => process.exit(0))
})

workerApp.on(WorkerMessage.Reload, async () => {
  await workerApp.reload()
  workerApp.emit('reloaded')
})

parentPort.on('message', ({ message, ...data }) => {
  workerApp.emit(message, data)
})

process.on('uncaughtException', (err) => logger.error(err))
process.on('unhandledRejection', (err) => logger.error(err))

module.exports = { WorkerApplication, workerApp }
