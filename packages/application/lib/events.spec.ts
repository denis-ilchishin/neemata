import { TestParser, testApp, testConnection, testEvent } from '@test/_utils'
import type { Application } from './application'
import type { AnyEvent } from './common'
import { Event, EventManager } from './events'
import type { BaseTransportConnection } from './transport'

describe.sequential('Event', () => {
  let event: Event

  beforeEach(() => {
    event = testEvent()
  })

  it('should be an event', () => {
    expect(event).toBeDefined()
    expect(event).toBeInstanceOf(Event)
  })

  it('should copy with payload', () => {
    const newEvent = event.withPayload<{ some: 'type' }>()
    expect(newEvent).toBeInstanceOf(Event)
    expect(newEvent).not.toBe(event)
  })

  it('should copy with options', () => {
    const newEvent = event.withOptions<{ some: 'type' }>()
    expect(newEvent).toBeInstanceOf(Event)
    expect(newEvent).not.toBe(event)
  })

  it('should copy with serializer', () => {
    const serializer = (opts) => ''
    const newEvent = event.withOptions<{ some: 'type' }>(serializer)
    expect(newEvent).toBeInstanceOf(Event)
    expect(newEvent.serializer).toBe(serializer)
    expect(newEvent).not.toBe(event)
  })

  it('should copy with parser', () => {
    const parser = new TestParser()
    const newEvent = event.withParser(parser)
    expect(newEvent).toBeInstanceOf(Event)
    expect(newEvent.parser).toBe(parser)
    expect(newEvent).not.toBe(event)
  })

  it('should copy with schema', () => {
    const schema = {}
    const newEvent = event.withSchema(schema)
    expect(newEvent).toBeInstanceOf(Event)
    expect(newEvent).not.toBe(event)
  })
})

describe.sequential('Event manager', () => {
  let app: Application
  let manager: EventManager
  let connection: BaseTransportConnection

  const getEventKey = (event: AnyEvent, eventName: string, options: any) =>
    'test/test:' + event.serializer(options)

  beforeEach(() => {
    app = testApp()
    manager = app.eventManager
    connection = testConnection(app.registry)
  })

  it('should be an event manager', () => {
    expect(manager).toBeDefined()
    expect(manager).toBeInstanceOf(EventManager)
  })

  it('should subscribe to event', async () => {
    const event = testEvent()
    app.registry.registerEvent('test', 'test', event)
    const options = { some: 'type' }
    const { subscription } = await manager.subscribe(event, options, connection)
    const eventKey = `test/test:${event.serializer(options)}`
    expect(connection.subscriptions.size).toBe(1)
    expect(connection.subscriptions.get(eventKey)).toBe(subscription)
  })

  it('should unsubscribe from event', async () => {
    const event = testEvent()
    app.registry.registerEvent('test', 'test', event)
    const options = { some: 'type' }
    await manager.subscribe(event, options, connection)
    expect(connection.subscriptions.size).toBe(1)
    await manager.unsubscribe(event, options, connection)
    expect(connection.subscriptions.size).toBe(0)

    // inline unsubscribe
    const { subscription } = await manager.subscribe(event, options, connection)
    expect(connection.subscriptions.size).toBe(1)
    await subscription.unsubscribe()
    expect(connection.subscriptions.size).toBe(0)
  })

  it('should return isSubscribed', async () => {
    const event = testEvent()
    app.registry.registerEvent('test', 'test', event)
    const options = { some: 'type' }

    await expect(
      manager.isSubscribed(event, options, connection),
    ).resolves.toBe(false)
    await manager.subscribe(event, options, connection)
    await expect(
      manager.isSubscribed(event, options, connection),
    ).resolves.toBe(true)
    await manager.unsubscribe(event, options, connection)
    await expect(
      manager.isSubscribed(event, options, connection),
    ).resolves.toBe(false)
  })

  it('should return existing subscription', async () => {
    const event = testEvent()
    app.registry.registerEvent('event', 'event', event)
    const options = { some: 'type' }
    const sub1 = await manager.subscribe(event, options, connection)
    expect(sub1.isNew).toBe(true)
    const sub2 = await manager.subscribe(event, options, connection)
    expect(sub2.isNew).toBe(false)
    expect(sub1.subscription).toBe(sub2.subscription)
    expect(connection.subscriptions.size).toBe(1)
  })

  it('should publish event', async () => {
    const event = testEvent()
    app.registry.registerEvent('event', 'event', event)
    const options = { some: 'type' }
    const payload = { some: 'payload' }
    const { subscription } = await manager.subscribe(event, options, connection)
    setTimeout(() => manager.publish(event, payload, options), 1)
    await expect(new Promise((r) => subscription.on('data', r))).resolves.toBe(
      payload,
    )
  })
})
