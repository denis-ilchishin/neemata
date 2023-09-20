import { Worker } from 'node:worker_threads'

/** @typedef {ReturnType<typeof createNeemataWorker>} NeemataWorker */

const startWorker = (worker) => {
  // worker.emit()
}

const listenWorker = (worker) => {}

export const createNeemataWorker = () => {
  const env = { ...process.env }
  const options = {
    env,
    execArgv: ['--no-warnings', '--loader', '@esbuild-kit/esm-loader'],
  }

  const thread = new Worker(new URL('./application', import.meta.url), options)

  thread.on('message', (msg) => {
    if (typeof msg === 'object') {
      const { event, payload } = msg
      thread.emit(event, payload)
    }
  })

  const reload = () => new Promise((resolve, reject) => {})

  return { reload }
}
