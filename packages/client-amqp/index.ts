import {
  ApiError,
  BaseClient,
  Call,
  ErrorCode,
  ResolveProcedureApiType,
  Stream,
} from '@neemata/common'
import amqplib from 'amqplib'

export { AmqpClient, ApiError, ErrorCode }

type Options = {
  connection: amqplib.Options.Connect
  requestQueue: string
  debug?: boolean
  timeout?: number
}

type RPCOptions = {
  timeout?: number
}

class AmqpClient<Api extends any = never> extends BaseClient<Api, RPCOptions> {
  private connection!: amqplib.Connection
  private channel!: amqplib.Channel
  private queue!: string
  private callId = 0
  private calls = new Map<string, Call>()

  constructor(private readonly options: Options) {
    super()
  }

  async connect() {
    this.connection = await amqplib.connect(this.options.connection)
    this.channel = await this.connection.createChannel()

    await this.channel.checkQueue(this.options.requestQueue)
    const { queue } = await this.channel.assertQueue('', {
      durable: false,
      autoDelete: true,
      exclusive: true,
    })

    this.queue = queue

    this.channel.consume(
      this.queue,
      (msg) => {
        const { correlationId } = msg.properties
        const call = this.calls.get(correlationId)
        if (!call) return
        const { resolve, reject, timer } = call
        const clear = () => clearTimeout(timer)
        try {
          const { response, error } = this.deserialize(msg.content)
          if (error) reject(new ApiError(error.code, error.message, error.data))
          else resolve(response)
        } catch (error) {
          reject(error)
        } finally {
          clear()
          this.calls.delete(correlationId)
        }
      },
      { noAck: true }
    )

    this.connection.once('error', (error) => {
      console.error(error)
      this.clear(new ApiError('Connection error', 'Connection error'))
      this.connect()
    })
  }

  async disconnect() {
    this.clear(new ApiError(ErrorCode.ConnectionError, 'Connection closed'))
    await this.channel?.close()
    await this.connection?.close()
  }

  async reconnect(): Promise<void> {
    await this.disconnect()
    await this.connect()
  }

  rpc<P extends keyof Api>(
    procedure: P,
    ...args: Api extends never
      ? [any?, RPCOptions?]
      : null extends ResolveProcedureApiType<Api, P, 'input'>
      ? [ResolveProcedureApiType<Api, P, 'input'>?, RPCOptions?]
      : [ResolveProcedureApiType<Api, P, 'input'>, RPCOptions?]
  ): Promise<
    Api extends never ? any : ResolveProcedureApiType<Api, P, 'output'>
  > {
    const [payload, options = {}] = args
    // TODO: implement AMQP message timeout
    const correlationId = (this.callId++).toString()
    this.channel.sendToQueue(
      this.options.requestQueue,
      this.serialize({
        procedure,
        payload,
      }),
      {
        contentType: 'application/json',
        correlationId,
        replyTo: this.queue,
      }
    )

    return new Promise((resolve, reject) => {
      const timeout = options.timeout || this.options.timeout
      const timer = timeout
        ? setTimeout(() => {
            reject(new ApiError(ErrorCode.RequestTimeout, 'Request timeout'))
            this.calls.delete(correlationId)
          }, timeout)
        : null
      this.calls.set(correlationId, { resolve, reject, timer })
    })
  }

  async createStream(
    input: Blob | ArrayBuffer | ReadableStream
  ): Promise<Stream> {
    throw new Error('Upload streams are not supported yet.')
  }

  private serialize(data: any) {
    return Buffer.from(JSON.stringify(data))
  }

  private deserialize(data: Buffer) {
    return JSON.parse(data.toString())
  }

  private clear(error) {
    for (const { reject, timer } of this.calls.values()) {
      clearTimeout(timer)
      reject(error)
    }
    this.calls.clear()
  }
}
