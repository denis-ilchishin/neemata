import { BaseParser, Procedure } from '@/api'
import { Application, type ApplicationOptions } from '@/application'
import { Event } from '@/events'
import { createLogger } from '@/logger'
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

export class TestConnection<D> extends BaseTransportConnection {
  readonly transport = 'test'

  constructor(readonly data: D) {
    super()
  }

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

export class TestTransport extends BaseTransport<TestConnection<any>> {
  name = 'Test transport'

  async start() {
    return true
  }

  async stop() {
    return true
  }

  initialize() {}
}

export const testDefaultTimeout = 1000

export const testLogger = () =>
  createLogger(
    {
      pinoOptions: { enabled: false },
    },
    'test',
  )

export const testApp = (options: Partial<ApplicationOptions> = {}) =>
  new Application(
    Object.assign(
      {
        type: WorkerType.Api,
        events: { timeout: testDefaultTimeout },
        loaders: [],
        api: {
          timeout: testDefaultTimeout,
        },
        tasks: {
          timeout: testDefaultTimeout,
        },
        logging: {
          pinoOptions: { enabled: false },
        },
      },
      options,
    ),
  )

export const testConnection = <T = {}>(data?: T) => {
  return new TestConnection(data ?? {})
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
