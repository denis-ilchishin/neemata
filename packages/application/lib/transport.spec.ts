import { TestTransport, testApp, testConnection, testEvent } from '@test/_utils'
import type { Application } from './application'

describe.sequential('Transport', () => {
  let app: Application<[TestTransport]>
  let transport: TestTransport

  beforeEach(async () => {
    transport = new TestTransport()
    app = testApp().registerTransport(transport)
    await app.initialize()
  })

  it('should start and stop', async () => {
    const startSpy = vi.spyOn(transport, 'start')
    const stopSpy = vi.spyOn(transport, 'stop')
    await app.start()
    expect(startSpy).toHaveBeenCalledOnce()
    await app.stop()
    expect(stopSpy).toHaveBeenCalledOnce()
  })

  it('should add connection', async () => {
    transport.addConnection(testConnection())
    expect(app.connections.size).toBe(1)
  })

  it('should remove connection', async () => {
    const connection = testConnection()
    transport.addConnection(connection)
    expect(app.connections.size).toBe(1)
    transport.removeConnection(connection)
    expect(app.connections.size).toBe(0)
  })

  it('should remove connection by id', async () => {
    const connection = testConnection()
    transport.addConnection(connection)
    expect(app.connections.size).toBe(1)
    transport.removeConnection(connection.id)
    expect(app.connections.size).toBe(0)
  })

  it('should get connection', async () => {
    const connection = testConnection()
    transport.addConnection(connection)
    expect(transport.getConnection(connection.id)).toBe(connection)
  })

  it('should check connection', async () => {
    const connection = testConnection()
    transport.addConnection(connection)
    expect(transport.hasConnection(connection)).toBe(true)
  })
})

describe.sequential('Transport connection', () => {
  let app: Application<[TestTransport]>
  let transport: TestTransport

  beforeEach(async () => {
    transport = new TestTransport()
    app = testApp().registerTransport(transport)
    await app.initialize()
  })

  it('should send event', async () => {
    const connection = testConnection()
    transport.addConnection(connection)
    const event = testEvent()
    const payload = { some: 'data' }
    const sendSpy = vi.spyOn(connection, 'sendEvent' as any)
    connection.send(event, payload)
    expect(sendSpy).toHaveBeenCalledWith(event.name, payload)
  })
})
