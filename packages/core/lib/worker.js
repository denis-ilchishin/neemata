const { parentPort, workerData, threadId } = require('node:worker_threads')
const { WorkerApplication } = require('./application')
const { WorkerMessage } = require('@neemata/common')
const { ConsoleLogger } = require('./console')

const logLevel = workerData.config.log.level
globalThis.logger = new ConsoleLogger(logLevel, 'Worker')

const app = new WorkerApplication({ ...workerData, threadId })

app.on(WorkerMessage.Invoke, async (data) => {
  const { task, id, timeout, args } = data
  const result = await app.runTask(task, timeout, ...args)
  parentPort.postMessage({ message: WorkerMessage.Result, id, ...result })
})

app.on(WorkerMessage.Result, (data) => {
  const { id, ...rest } = data
  app.emit(id, rest)
})

app.on(WorkerMessage.Invoke + WorkerMessage.Result, (data) => {
  parentPort.postMessage({
    message: WorkerMessage.Invoke,
    ...data,
  })
})

app.once(WorkerMessage.Startup, async () => {
  await app.startup()
  parentPort.postMessage({ message: WorkerMessage.Startup })
})

app.once(WorkerMessage.Shutdown, async () => {
  parentPort.close()
  await app.shutdown().finally(() => process.exit(0))
})

app.on(WorkerMessage.Reload, async () => {
  await app.reload()
  app.emit('reloaded')
})

parentPort.on('message', ({ message, ...data }) => {
  app.emit(message, data)
})

process.on('uncaughtException', (err) => logger.error(err))
process.on('unhandledRejection', (err) => logger.error(err))
