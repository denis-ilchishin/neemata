import EventEmitter from 'node:events'
import { WorkerType } from '@neematajs/application'
import type { ApplicationWorkerOptions } from './worker'

export const bindPortMessageHandler = (port: EventEmitter) => {
  port.on('message', (message) => {
    if (message && typeof message === 'object') {
      const { type, payload } = message
      if (typeof type === 'string') {
        port.emit(type, payload)
      }
    }
  })
}

export const createBroadcastChannel = (name: string) => {
  const channel = new BroadcastChannel(name)
  const emitter = new EventEmitter()
  channel.onmessageerror = console.error
  channel.onmessage = (message) => {
    // @ts-ignore
    emitter.emit('message', message.data)
  }
  bindPortMessageHandler(emitter)
  const close = () => {
    channel.close()
    emitter.removeAllListeners()
  }
  const postMessage = (message: any) => channel.postMessage(message)

  return Object.assign(emitter, { close, postMessage })
}

const WORKER_OPTIONS_KEY = Symbol('neemata:workerOptions')

export const providerWorkerOptions = (opts: ApplicationWorkerOptions) => {
  globalThis[WORKER_OPTIONS_KEY] = opts
}

export const injectWorkerOptions = (): ApplicationWorkerOptions => {
  return (
    globalThis[WORKER_OPTIONS_KEY] ?? {
      id: 0,
      type: WorkerType.Api,
    }
  )
}

export enum WorkerMessageType {
  Ready = 'Ready',
  Start = 'Start',
  Stop = 'Stop',
  ExecuteInvoke = 'ExecuteInvoke',
  ExecuteResult = 'ExecuteResult',
  ExecuteAbort = 'ExecuteAbort',
}
