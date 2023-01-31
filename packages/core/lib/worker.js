const { parentPort } = require('node:worker_threads')
const { WorkerApplication } = require('./application')
const { WorkerMessage } = require('@neemata/common')

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
