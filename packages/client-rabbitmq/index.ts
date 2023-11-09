import { ApiError, ErrorCode } from '@neemata/common'
import amqplib from 'amqplib'
import { EventEmitter } from 'events'

export { ApiError, Client, ErrorCode }

type Options = {
  connection: amqplib.Options.Connect
  requestQueue: string
  responseQueue: string
  debug?: boolean
  timeout?: number
}

type Call = [
  (value?: any) => void,
  (reason?: any) => void,
  ReturnType<typeof setTimeout>
]

type GeneratedApi = {
  input?: any
  output?: any
}
type GenerateApiType<
  Api,
  Key,
  Type extends keyof GeneratedApi
> = Key extends keyof Api
  ? Api[Key] extends GeneratedApi
    ? Api[Key][Type]
    : any
  : any

type RPCOptions = {
  timeout?: number
}

class Client<Api extends any = never> extends EventEmitter {
  private connection!: amqplib.Connection
  private channel!: amqplib.Channel

  private nextCallId = 1
  private calls = new Map<string, Call>()

  constructor(private readonly options: Options) {
    super()
  }

  async connect() {
    this.connection = await amqplib.connect(this.options.connection)
    this.channel = await this.connection.createChannel()

    await Promise.all([
      this.channel.assertQueue(this.options.requestQueue, { durable: false }),
      this.channel.assertQueue(this.options.responseQueue, { durable: false }),
    ])

    this.channel.consume(this.options.responseQueue, (msg) => {
      const { correlationId } = msg.properties
      try {
        const { response, error } = this.deserialize(msg.content)
        const call = this.calls.get(correlationId)
        if (call) {
          const [resolve, reject, timer] = call
          clearTimeout(timer)
          if (error) {
            reject(new ApiError(error.code, error.message, error.data))
          } else {
            resolve(response)
          }
        }
      } catch (error) {
        console.error(new Error('Unexpected error', { cause: error }))
      } finally {
        this.calls.delete(correlationId)
      }
    })
  }

  async disconnect() {}

  rpc<P extends keyof Api>(
    procedure: P,
    ...args: Api extends never
      ? [any?, RPCOptions?]
      : null | undefined extends GenerateApiType<Api, P, 'input'>
      ? [GenerateApiType<Api, P, 'input'>?, RPCOptions?]
      : [GenerateApiType<Api, P, 'input'>, RPCOptions?]
  ): Promise<Api extends never ? any : GenerateApiType<Api, P, 'output'>> {
    const [payload, options = {}] = args
    // TODO: implement timeout
    const correlationId = (this.nextCallId++).toString()
    this.channel.sendToQueue(
      this.options.requestQueue,
      this.serialize({
        procedureName: procedure,
        payload,
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
      this.calls.set(correlationId, [resolve, reject, timer])
    })
  }

  private serialize(data: any) {
    return Buffer.from(JSON.stringify(data))
  }

  private deserialize(data: Buffer) {
    return JSON.parse(data.toString())
  }
}
