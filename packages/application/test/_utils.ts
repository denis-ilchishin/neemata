import { BaseParser, Procedure } from '@/api'
import { Application, ApplicationOptions } from '@/application'
import { Event } from '@/events'
import { BaseTaskRunner, Task } from '@/tasks'
import { BaseTransport, BaseTransportConnection } from '@/transport'
import { WorkerType } from '@/types'

export class TestParser extends BaseParser {
  constructor(private readonly custom?: (schema, val) => any) {
    super()
  }

  parse(schema, val) {
    return this.custom ? this.custom(schema, val) : val
  }
}

export class TestConnection extends BaseTransportConnection {
  protected sendEvent(eventName: string, payload: any): boolean {
    return false
  }
}

export class TestTaskRunner extends BaseTaskRunner {
  constructor(
    private readonly custom?: (task: any, ...args: any[]) => Promise<any>,
  ) {
    super()
  }

  execute(signal: AbortSignal, name: string, ...args: any[]): Promise<any> {
    return this.custom ? this.custom(name, ...args) : Promise.resolve()
  }
}

export class TestTransport extends BaseTransport {
  name = 'Test transport'

  async start() {
    return true
  }

  async stop() {
    return true
  }

  initialize() {}

  context(): {} {
    return {}
  }
}

export const defaultTimeout = 1000

export const testApp = (options: Partial<ApplicationOptions> = {}) =>
  new Application(
    Object.assign(
      {
        type: WorkerType.Api,
        events: { timeout: defaultTimeout },
        loaders: [],
        procedures: {
          timeout: defaultTimeout,
        },
        tasks: {
          timeout: defaultTimeout,
        },
        logging: {
          pinoOptions: { enabled: false },
        },
      },
      options,
    ),
  )

export const testConnection = (transportData = {}, data = {}) => {
  return new TestConnection(transportData, data)
}

export const testProcedure = () => new Procedure().withName('test')

export const testTask = () => new Task().withName('test')

export const testEvent = () => new Event().withName('test')

export const testTaskRunner = (...args) => new TestTaskRunner(...args)

export const testTransport = () => new TestTransport()

export const expectCopy = (source, targer) => {
  expect(targer).not.toBe(source)
  expect(targer).toEqual(source)
}
