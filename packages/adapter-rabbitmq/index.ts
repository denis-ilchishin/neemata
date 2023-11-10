import {
  BaseAdapter,
  ExtensionInstallOptions,
  Hook,
} from '@neemata/application'
import { ApiError } from '@neemata/common'
import amqplib from 'amqplib'

export type AdapterOptions = {
  connection: amqplib.Options.Connect
  requestQueue: string
  responseQueue: string
}

export type AdapterContext = {
  connection: amqplib.Connection
}
export class Adapter extends BaseAdapter<{}, AdapterContext> {
  name = 'RabbitMQ'

  application!: ExtensionInstallOptions
  connection!: amqplib.Connection
  channel!: amqplib.Channel

  constructor(private readonly options: AdapterOptions) {
    super()
  }

  install(options: ExtensionInstallOptions) {
    this.application = options
    this.application.registerHook(Hook.Start, async () => {
      this.application.logger.debug('Connecting to RabbitMQ...')
      this.connection = await amqplib.connect(this.options.connection)
    })
  }

  async start() {
    this.application.logger.debug('Creating a channel...')
    const channel = await this.connection.createChannel()
    await Promise.all([
      channel.assertQueue(this.options.requestQueue, { durable: false }),
      channel.assertQueue(this.options.responseQueue, { durable: false }),
    ])
    this.application.logger.info(
      'Listening [%s] queue for requests',
      this.options.requestQueue
    )
    channel.consume(this.options.requestQueue, this.handleRPC.bind(this))
  }

  async stop() {
    this.connection?.close()
  }

  private async handleRPC(msg: amqplib.ConsumeMessage) {
    const { correlationId } = msg.properties
    const respond = (data: any) =>
      this.channel.sendToQueue(
        this.options.responseQueue,
        this.serialize(data),
        { correlationId, contentType: 'application/json' }
      )
    try {
      const { procedure, payload } = this.deserialize(msg.content)
      const declaration = await this.application.api.find(procedure)
      const response = await this.application.api.call(
        procedure,
        declaration,
        payload,
        this.application.container,
        {}
      )
      respond({ response })
    } catch (error) {
      if (error instanceof ApiError) {
        respond({ error })
      } else {
        this.application.logger.error(
          new Error('Unexpected error', { cause: error })
        )
        respond({ error: new ApiError('InternalError', 'Internal error') })
      }
    }
  }

  private serialize(data: any) {
    return Buffer.from(JSON.stringify(data))
  }

  private deserialize(data: Buffer) {
    return JSON.parse(data.toString())
  }

  context(): AdapterContext {
    return { connection: this.connection }
  }
}
