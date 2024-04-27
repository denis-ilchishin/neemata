import { BaseParser, Procedure } from '@/api'
import { Application, type ApplicationOptions } from '@/application'
import { WorkerType } from '@/common'
import { Event } from '@/events'
import { BaseExtension } from '@/extension'
import { createLogger } from '@/logger'
import type { Registry } from '@/registry'
import { BaseTaskRunner, Task } from '@/tasks'
import { BaseTransport, BaseTransportConnection } from '@/transport'

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

  constructor(
    registry: Registry,
    readonly data: D,
  ) {
    super(registry)
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
export class TestExtension extends BaseExtension {
  name = 'Test extension'
}

export class TestTransport extends BaseTransport<TestConnection<any>> {
  static readonly key = 'test'

  // biome-ignore lint/complexity/noUselessConstructor:
  constructor(...args: any[]) {
    // @ts-expect-error
    super(...args)
  }

  name = 'Test transport'

  async start() {
    return true
  }

  async stop() {
    return true
  }
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

export const testConnection = <T = {}>(registry: Registry, data?: T) => {
  return new TestConnection(registry, data ?? {})
}

export const testProcedure = () => new Procedure().withTransport(TestTransport)

export const testTask = () => new Task()

export const testEvent = () => new Event()

export const testTaskRunner = (...args) => new TestTaskRunner(...args)

export const expectCopy = (source, targer) => {
  expect(targer).not.toBe(source)
  expect(targer).toEqual(source)
}
