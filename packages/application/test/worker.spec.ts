import { Application } from '@/application'
import { WorkerMessageType, WorkerType } from '@/types'
import { defer, noop } from '@/utils/functions'
import { bindPortMessageHandler, injectWorkerOptions } from '@/utils/threads'
import { ApplicationWorkerData, start as startWorker } from '@/worker'
import { randomUUID } from 'node:crypto'
import EventEmitter, { once } from 'node:events'
import { MessagePort } from 'node:worker_threads'
import { testApp, testTask } from './_utils'

const applicationPath = '@app'

// @ts-ignore
const bc = await vi.hoisted(async () => {
  console.log('CREATE BC')
  const { EventEmitter } = await import('node:events')
  const createPort = (id) => {
    const emitter = new EventEmitter()
    emitter.on('message', (message) => {
      if (message && typeof message === 'object') {
        const { type, payload } = message
        if (typeof type === 'string') {
          emitter.emit(type, payload)
        }
      }
    })
    return Object.assign(emitter, { id })
  }
  const assignPort = (port: EventEmitter, port2: EventEmitter) => {
    const postMessage = (message: any) => port2.emit('message', message)
    const close = () => port.removeAllListeners()
    return Object.assign(port, { close, postMessage })
  }
  const port1 = createPort('port1')
  const port2 = createPort('port2')
  return {
    port1: assignPort(port1, port2),
    port2: assignPort(port2, port1),
  }
})

vi.mock('@/utils/threads', async (originalImport) => {
  return {
    ...(await originalImport<any>()),
    createBroadcastChannel: () => bc.port2,
  }
})

describe.sequential('Application Worker', () => {
  let mPort: MessagePort
  let worker: MessagePort
  let app: Application

  beforeEach(async () => {
    app = testApp()
    vi.doMock(applicationPath, () => ({ default: app }))
    const { port1, port2 } = new MessageChannel()
    worker = port1
    mPort = port2
    bindPortMessageHandler(port1)
  })

  it('should start api worker', async () => {
    const initializeSpy = vi.spyOn(app, 'initialize')
    const startSpy = vi.spyOn(app, 'start')
    const stopSpy = vi.spyOn(app, 'stop')

    const workerData: ApplicationWorkerData = {
      id: 1,
      type: WorkerType.Api,
      applicationPath: applicationPath,
      hasTaskRunners: false,
      workerOptions: ['workerOpt'],
    }
    await expect(startWorker(mPort, workerData)).resolves.toBe(app)
    worker.postMessage({ type: WorkerMessageType.Start })
    await once(worker, WorkerMessageType.Ready)
    worker.postMessage({ type: WorkerMessageType.Stop })
    await once(worker, 'exit')

    expect(initializeSpy).toHaveBeenCalledOnce()
    expect(startSpy).toHaveBeenCalledOnce()
    expect(stopSpy).toHaveBeenCalledOnce()
    expect(injectWorkerOptions()).toEqual({
      id: 1,
      type: WorkerType.Api,
      workerOptions: ['workerOpt'],
    })
  })

  it('should initialize/start/stop task worker', async () => {
    const initializeSpy = vi.spyOn(app, 'initialize')
    const startSpy = vi.spyOn(app, 'start')
    const stopSpy = vi.spyOn(app, 'stop')

    const workerData: ApplicationWorkerData = {
      id: 1,
      type: WorkerType.Task,
      applicationPath: applicationPath,
      hasTaskRunners: false,
      workerOptions: ['workerOpt'],
    }
    await expect(startWorker(mPort, workerData)).resolves.toBe(app)
    worker.postMessage({ type: WorkerMessageType.Start })
    await once(worker, WorkerMessageType.Ready)
    worker.postMessage({ type: WorkerMessageType.Stop })
    await once(worker, 'exit')

    expect(initializeSpy).toHaveBeenCalledOnce()
    expect(startSpy).toHaveBeenCalledOnce()
    expect(stopSpy).toHaveBeenCalledOnce()
    expect(injectWorkerOptions()).toEqual({
      id: workerData.id,
      type: workerData.type,
      workerOptions: workerData.workerOptions,
    })
  })

  it('should fail task execution invocation ', async () => {
    const workerData: ApplicationWorkerData = {
      id: 1,
      type: WorkerType.Task,
      applicationPath: applicationPath,
      hasTaskRunners: false,
      workerOptions: ['workerOpt'],
    }
    startWorker(mPort, workerData)
    const id = 'test'
    const name = 'test'
    const args = ['test']
    setTimeout(() =>
      worker.postMessage({
        type: WorkerMessageType.ExecuteInvoke,
        payload: {
          id,
          name,
          args,
        },
      }),
    )
    const [result] = await once(bc.port1, WorkerMessageType.ExecuteResult)
    expect(result).toEqual({
      error: expect.any(Error),
    })
  })

  it('should handle task execution invocation', async () => {
    const task = testTask().withHandler((ctx, ...args) => ({
      args,
      result: 'task result',
    }))
    app.loader.register('tasks', task.name, task)
    const workerData: ApplicationWorkerData = {
      id: 1,
      type: WorkerType.Task,
      applicationPath: applicationPath,
      hasTaskRunners: false,
      workerOptions: ['workerOpt'],
    }
    startWorker(mPort, workerData)
    const executeSpy = vi.spyOn(app, 'execute')
    const id = randomUUID()
    const name = task.name
    const args = ['test']
    setTimeout(() =>
      worker.postMessage({
        type: WorkerMessageType.ExecuteInvoke,
        payload: {
          id,
          name,
          args,
        },
      }),
    )
    const [result] = await once(bc.port1, WorkerMessageType.ExecuteResult)
    expect(executeSpy).toHaveBeenCalledWith(task, ...args)
    expect(result).toEqual({
      result: {
        args,
        result: 'task result',
      },
    })
  })

  it('should handle task execution abortion', async () => {
    const task = testTask().withHandler((ctx) => new Promise(noop))
    app.loader.register('tasks', task.name, task)
    const workerData: ApplicationWorkerData = {
      id: 1,
      type: WorkerType.Task,
      applicationPath: applicationPath,
      hasTaskRunners: false,
    }
    startWorker(mPort, workerData)
    const id = 'task execution abortion'
    const name = task.name
    const args = ['test']

    defer(() =>
      worker.postMessage({
        type: WorkerMessageType.ExecuteInvoke,
        payload: {
          id,
          name,
          args,
        },
      }),
    )

    defer(
      () =>
        bc.port1.postMessage({
          type: WorkerMessageType.ExecuteAbort,
          payload: {
            reason: 'test',
          },
        }),
      10,
    )

    const [result] = await once(bc.port1, WorkerMessageType.ExecuteResult)
    expect(result).toEqual({
      error: 'test',
    })
  })
})
