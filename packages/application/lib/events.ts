import {
  AnyApplication,
  ExtensionInstallOptions,
  ExtensionInterface,
  InferSchema,
  Scalars,
} from './types'

export class Event<Payload extends any = any, Schema extends any = unknown> {
  readonly payload!: Schema extends unknown ? Payload : InferSchema<Schema>
  readonly schema!: Schema

  withPayload<NewPayload extends any>() {
    const event = new Event<NewPayload, Schema>()
    Object.assign(event, this)
    return event
  }

  withSchema<NewSchema extends any>(schema: NewSchema) {
    const event = new Event<Payload, NewSchema>()
    Object.assign(event, this, { schema })
    return event
  }
}

export type EventManagerContext<App extends AnyApplication = AnyApplication> = {
  subManager: BaseEventManager<App>
}

export type EventManagerClientKeys = Record<string, Scalars>

export type EventManagerClientKeysResolver<
  App extends AnyApplication = AnyApplication
> = (client: App['_']['client']) => EventManagerClientKeys

export abstract class BaseEventManager<App extends AnyApplication>
  implements ExtensionInterface<{}, EventManagerContext>
{
  readonly _!: { context: EventManagerContext<AnyApplication>; options: {} }
  readonly application!: ExtensionInstallOptions<
    {},
    EventManagerContext<AnyApplication>
  >

  constructor(
    protected readonly keys: EventManagerClientKeysResolver<App>,
    protected readonly mode: 'all' | 'any'
  ) {}

  context?(): EventManagerContext<AnyApplication> {
    throw new Error('Method not implemented.')
  }

  initialize?() {
    throw new Error('Method not implemented.')
  }

  abstract publish(
    event: Event,
    payload: Event['payload'],
    keys?: EventManagerClientKeys
  ): Promise<boolean>
  abstract subscribe(event: Event, client: App['_']['client']): Promise<boolean>
  abstract unsubscribe(
    event: Event,
    client: App['_']['client']
  ): Promise<boolean>
}

// export class WorkerThreadsEventManager<
//   App extends AnyApplication = AnyApplication
// > extends BaseEventManager<App> {

//   async publish(
//     event: Event,
//     payload: Event['payload'],
//     keys: EventManagerClientKeys = {}
//   ): Promise<boolean> {
//     return false
//   }

//   async subscribe(event: Event, client: App['_']['client']): Promise<boolean> {
//     return false
//   }

//   async unsubscribe(
//     event: Event,
//     client: App['_']['client']
//   ): Promise<boolean> {
//     return false
//   }
// }
