import { createNeemataWorker } from './worker.js'

const createNeemata = () => {
  const workers = new Set()

  const start = async () => {
    for (let i = 0; i < 1; i++) {
      const worker = createNeemataWorker()
      workers.add(worker)
    }
  }

  return { start, workers }
}

export const start = async () => {
  const app = createNeemata()
  await app.start()
}
