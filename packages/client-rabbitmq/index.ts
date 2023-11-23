import {
  ApiError,
  BaseClient,
  ErrorCode,
  ResolveProcedureApiType,
} from '@neemata/common'

import amqplib from 'amqplib'

export { ApiError, Client, ErrorCode }

type Options = {
  connection: amqplib.Options.Connect
  requestQueue: string
  debug?: boolean
  timeout?: number
}

type RPCOptions = {
  timeout?: number
}

class Client<Api extends any = never> extends BaseClient<Api, RPCOptions> {
  private connection!: amqplib.Connection
  private channel!: amqplib.Channel
  private queue!: string

  constructor(private readonly options: Options) {
    super()
  }

  async connect() {
    this.connection = await amqplib.connect(this.options.connection)
    this.channel = await this.connection.createChannel()

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
        const call = this._calls.get(correlationId)
        if (!call) return
        const [resolve, reject, timer] = call
        const clear = () => clearTimeout(timer)
        try {
          const { response, error } = this.deserialize(msg.content)
          if (error) reject(new ApiError(error.code, error.message, error.data))
          else resolve(response)
        } catch (error) {
          reject(error)
        } finally {
          clear()
          this._calls.delete(correlationId)
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
    this.clear(new ApiError('Connection closed', 'Connection closed'))
    await this.channel?.close()
    await this.connection?.close()
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
    // TODO: implement RabbitMQ message timeout
    const correlationId = (this._nextCallId++).toString()
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
            this._calls.delete(correlationId)
          }, timeout)
        : null
      this._calls.set(correlationId, [resolve, reject, timer])
    })
  }

  private serialize(data: any) {
    return Buffer.from(JSON.stringify(data))
  }

  private deserialize(data: Buffer) {
    return JSON.parse(data.toString())
  }

  private clear(error) {
    for (const [_, reject] of this._calls.values()) reject(error)
    this._calls.clear()
  }
}
