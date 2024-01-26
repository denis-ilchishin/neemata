import { BinaryStreamResponse, JsonStreamResponse, Stream } from '@/streams'
import { Duplex } from 'node:stream'

describe.sequential('Streams -> Response -> JSON', () => {
  it('should be a duplex', () => {
    expect(new JsonStreamResponse()).toBeInstanceOf(Duplex)
  })

  it('should assign paylaod', () => {
    const payload = { test: true }
    const stream = new JsonStreamResponse().withPayload(payload)
    expect(stream.payload).toBe(payload)
  })

  it('should assign chunk type', () => {
    const stream = new JsonStreamResponse()
    const stream2 = stream.withChunk<{ any: boolean }>()
    expect(stream).toBe(stream2)
  })

  it('should write an in object-mode', async () => {
    const stream = new JsonStreamResponse()
    const payload = { test: true }
    setTimeout(() => stream.write(payload), 1)
    const expectation = new Promise((r) => stream.on('data', r))
    await expect(expectation).resolves.toEqual(
      Buffer.from(JSON.stringify(payload)),
    )
  })

  it('should handle invalid object', async () => {
    const stream = new JsonStreamResponse()
    const payload: any = { test: true }
    payload.circular = payload
    setTimeout(() => stream.write(payload), 1)
    const expectation = new Promise((r) => stream.on('error', r))
    await expect(expectation).resolves.toBeInstanceOf(Error)
  })
})

describe.sequential('Streams -> Response -> Binary', () => {
  it('should be a duplex', () => {
    expect(new BinaryStreamResponse('type')).toBeInstanceOf(Duplex)
  })

  it('should assign paylaod', () => {
    const payload = 'test'
    const stream = new BinaryStreamResponse('type').withPayload(payload)
    expect(stream.payload).toBe(payload)
  })

  it('should assign chunk type', () => {
    const stream = new JsonStreamResponse()
    const stream2 = stream.withChunk<{ any: boolean }>()
    expect(stream).toBe(stream2)
  })

  it('should write', async () => {
    const stream = new BinaryStreamResponse('type')
    const payload = 'test'
    setTimeout(() => stream.write(payload), 1)
    const expectation = new Promise((r) => stream.on('data', r))
    await expect(expectation).resolves.toEqual(Buffer.from(payload))
  })
})

describe.sequential('Streams -> Request -> Stream', () => {
  let stream: Stream

  beforeEach(() => {
    stream = new Stream('1', { size: 1, type: 'type', filename: 'filename' })
  })

  it('should be a duplex', () => {
    expect(stream).toBeInstanceOf(Duplex)
  })

  it('should have properties', () => {
    expect(stream).toHaveProperty('id', '1')
    expect(stream).toHaveProperty('metadata', {
      size: 1,
      type: 'type',
      filename: 'filename',
    })
  })

  it('should count bytes', () => {
    const buffer = Buffer.from('test')
    stream.push(buffer)
    expect(stream.bytesReceived).toBe(buffer.byteLength)
  })
})
