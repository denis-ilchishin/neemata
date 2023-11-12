import {
  ApiError,
  BaseClient,
  ErrorCode,
  ResolveProcedureApiType,
} from '@neemata/common'
import { randomUUID } from 'node:crypto'

import amqplib from 'amqplib'

export { ApiError, Client, ErrorCode }

type Options = {
  connection: amqplib.Options.Connect
  requestQueue: string
  responseQueue: string
  debug?: boolean
  timeout?: number
}

type RPCOptions = {
  timeout?: number
}

class Client<Api extends any = never> extends BaseClient<Api, RPCOptions> {
  private connection!: amqplib.Connection
  private channel!: amqplib.Channel
  private responseQueue: string

  constructor(private readonly options: Options) {
    super()
    this.responseQueue = `${this.options.responseQueue}:${randomUUID()}`
  }

  async connect() {
    this.connection = await amqplib.connect(this.options.connection)
    this.channel = await this.connection.createChannel()

    await Promise.all([
      this.channel.assertQueue(this.options.requestQueue, { durable: false }),
      this.channel.assertQueue(this.responseQueue, {
        durable: false,
        autoDelete: true,
      }),
    ])

    this.channel.consume(
      this.responseQueue,
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
  }

  async disconnect() {
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
    const queue = this.responseQueue
    this.channel.sendToQueue(
      this.options.requestQueue,
      this.serialize({
        procedure,
        payload,
        queue,
      }),
      {
        contentType: 'application/json',
        correlationId,
      }
    )

    return new Promise((resolve, reject) => {
      const timeout = options.timeout || this.options.timeout
      const timer = timeout
        ? setTimeout(() => {
            reject(new ApiError(ErrorCode.RequestTimeout, 'Request timeout'))
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
}
