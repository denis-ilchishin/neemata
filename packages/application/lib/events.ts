import { createHash } from 'node:crypto'
import { Subscription } from './subscription'
import { AnyApplication, InferSchemaInput, InferSchemaOutput } from './types'

export type EventOptionsType = Record<string, string | number>

export class Event<
  App extends AnyApplication = AnyApplication,
  EventPayload extends any = any,
  EventSchema extends any = unknown,
  EventOptions extends EventOptionsType = {},
> {
  name!: string

  readonly _!: {
    payload: EventSchema extends unknown
      ? EventPayload
      : InferSchemaOutput<EventSchema>
    options: EventOptions
  }
  readonly schema!: EventSchema
  readonly serializer = (options: EventOptions) => {
    const keys = Object.keys(options).sort()
    if (!keys.length) return ''
    const vals = {}
    for (const key of keys) vals[key] = options[key]
    return createHash('sha1').update(JSON.stringify(vals)).digest('base64url')
  }

  withPayload<NewPayload extends any>() {
    const event = new Event<App, NewPayload, EventSchema, EventOptions>()
    Object.assign(event, this)
    return event
  }

  withOptions<NewOptions extends Record<string, any>>(
    serializer?: (options: NewOptions) => string,
  ) {
    const event = new Event<App, EventPayload, EventSchema, NewOptions>()
    Object.assign(event, this, serializer ? { serializer } : {})
    return event
  }

  withSchema<NewSchema>(schema: NewSchema) {
    const event = new Event<App, EventPayload, NewSchema, EventOptions>()
    Object.assign(event, this, { schema })
    return event
  }

  withName(name: string) {
    const event = new Event<App, EventPayload, EventSchema, EventOptions>()
    Object.assign(event, this, { name })
    return event
  }

  _key(options: EventOptions) {
    const key = this.serializer(options)
    return this.name + (key ? `:${key}` : '')
  }
}

export class EventManager<App extends AnyApplication = AnyApplication> {
  constructor(private readonly application: App) {}

  async subscribe<E extends Event>(
    event: E,
    options: E['_']['options'],
    connection: App['_']['connection'],
  ): Promise<[Subscription<E>, boolean]> {
    if (!event.name) throw new Error('Event name is required')
    if (!this.application.loader.event(event.name))
      throw new Error(`Event ${event.name} not found`)

    const key = event._key(options)
    const { id, subscriptions } = connection
    let subscription = subscriptions.get(key)
    if (subscription) return [subscription as any, false]
    this.logger.debug(
      options,
      `Subscribing connection [${id}] to event [${event.name}] with options`,
    )
    subscription = new Subscription(event, key, () =>
      this.unsubscribe(event, options, connection),
    )
    subscriptions.set(key, subscription)
    await this.subManager.subscribe(subscription)
    return [subscription as any, true]
  }

  async unsubscribe(
    event: Event,
    options: Event['_']['options'],
    connection: App['_']['connection'],
  ) {
    const { id, subscriptions } = connection
    this.logger.debug(
      `Unsubscribing connection [${id}] from event [${event.name}]`,
    )
    const key = event._key(options)
    const subscription = subscriptions.get(key)
    if (!subscription) return false
    const result = await this.subManager.unsubscribe(subscription)
    subscription.emit('unsubscribe')
    subscriptions.delete(key)
    return result
  }

  async publish<E extends Event>(
    event: E,
    payload: E['schema'] extends unknown
      ? E['_']['payload']
      : InferSchemaInput<E['schema']>,
    options: E['_']['options'],
  ) {
    this.logger.debug(payload, `Publishing event [${event.name}]`)
    const key = event._key(options)
    return this.subManager.publish(event, key, payload)
  }

  async isSubscribed<E extends Event>(
    event: E,
    options: E['_']['options'],
    connection: App['_']['connection'],
  ) {
    const key = event._key(options)
    return connection.subscriptions.has(key)
  }

  private get subManager() {
    return this.application.subManager
  }

  private get logger() {
    return this.application.logger
  }
}
