import { randomUUID } from 'node:crypto'
import type EventEmitter from 'node:events'
import { once } from 'node:events'
import type { MessagePort } from 'node:worker_threads'
import {
  Application,
  Task,
  WorkerType,
  defer,
  noop,
} from '@neematajs/application'
import {
  WorkerMessageType,
  bindPortMessageHandler,
  injectWorkerOptions,
} from './common'
import { type ApplicationWorkerData, start as startWorker } from './worker'

const applicationPath = '@app'

// @ts-ignore
const bc = await vi.hoisted(async () => {
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

vi.mock('./common', async (originalImport) => {
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
    app = new Application({
      api: { timeout: 5000 },
      events: { timeout: 5000 },
      tasks: { timeout: 5000 },
      type: WorkerType.Api,
    })
    vi.doMock(applicationPath, () => ({ default: app }))
    const { port1, port2 } = new MessageChannel()
    worker = port1
    mPort = port2
    bindPortMessageHandler(port1)
  })

  it('should inject default worker options', () => {
    expect(injectWorkerOptions()).toEqual({
      id: 0,
      isServer: false,
      workerType: WorkerType.Api,
    })
  })

  it('should start api worker', async () => {
    const initializeSpy = vi.spyOn(app, 'initialize')
    const startSpy = vi.spyOn(app, 'start')
    const stopSpy = vi.spyOn(app, 'stop')

    const workerData: ApplicationWorkerData = {
      id: 1,
      workerType: WorkerType.Api,
      applicationPath: applicationPath,
      hasTaskRunners: false,
      workerOptions: ['workerOpt'],
      isServer: true,
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
      isServer: workerData.isServer,
      workerType: workerData.workerType,
      workerOptions: workerData.workerOptions,
    })
  })

  it('should initialize/start/stop task worker', async () => {
    const initializeSpy = vi.spyOn(app, 'initialize')
    const startSpy = vi.spyOn(app, 'start')
    const stopSpy = vi.spyOn(app, 'stop')

    const workerData: ApplicationWorkerData = {
      id: 1,
      workerType: WorkerType.Task,
      applicationPath: applicationPath,
      hasTaskRunners: false,
      workerOptions: ['workerOpt'],
      isServer: true,
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
      isServer: workerData.isServer,
      workerType: workerData.workerType,
      workerOptions: workerData.workerOptions,
      taskRunner: workerData.tasksRunner,
    })
  })

  it('should fail task execution invocation ', async () => {
    const workerData: ApplicationWorkerData = {
      id: 1,
      workerType: WorkerType.Task,
      applicationPath: applicationPath,
      hasTaskRunners: false,
      workerOptions: ['workerOpt'],
      isServer: true,
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
    const task = new Task().withHandler((ctx, ...args) => ({
      args,
      result: 'task result',
    }))
    app.registry.registerTask('test', 'test', task)
    const workerData: ApplicationWorkerData = {
      id: 1,
      workerType: WorkerType.Task,
      applicationPath: applicationPath,
      hasTaskRunners: false,
      workerOptions: ['workerOpt'],
      isServer: true,
    }
    startWorker(mPort, workerData)
    const executeSpy = vi.spyOn(app, 'execute')
    const id = randomUUID()
    const name = 'test/test'
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
    const task = new Task().withHandler((ctx) => new Promise(noop))
    app.registry.registerTask('test', 'test', task)
    const workerData: ApplicationWorkerData = {
      id: 1,
      workerType: WorkerType.Task,
      applicationPath: applicationPath,
      hasTaskRunners: false,
      isServer: true,
    }
    startWorker(mPort, workerData)
    const id = 'task execution abortion'
    const name = 'test/test'
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
