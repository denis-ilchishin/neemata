import {
  ApiError,
  BaseAdapter,
  ExtensionInstallOptions,
  Hook,
} from '@neemata/application'

import amqplib from 'amqplib'

export type AdapterOptions = {
  connection: amqplib.Options.Connect
  requestQueue: string
}

type AdapterProcedureOptions = {}
type AdapterContext = {
  connection: amqplib.Connection
}
export class Adapter extends BaseAdapter<
  AdapterProcedureOptions,
  AdapterContext
> {
  name = 'RabbitMQ'

  application!: ExtensionInstallOptions
  connection!: amqplib.Connection
  channel!: amqplib.Channel

  constructor(private readonly options: AdapterOptions) {
    super()
  }

  install(
    application: ExtensionInstallOptions<
      AdapterProcedureOptions,
      AdapterContext
    >
  ) {
    this.application = application
    this.application.registerHook(Hook.BeforeStart, async () => {
      // make connection before start
      // so it can be added to application context
      this.application.logger.debug('Connecting to RabbitMQ...')
      this.connection = await amqplib.connect(this.options.connection)
    })
  }

  async start() {
    const { requestQueue } = this.options
    this.application.logger.debug('Creating a channel...')
    this.channel = await this.connection.createChannel()
    await this.channel.assertQueue(requestQueue, { durable: false })

    this.application.logger.info('Listening on [%s] queue', requestQueue)
    await this.channel.consume(requestQueue, this.handleRPC.bind(this))
  }

  async stop() {
    await this.channel?.close()
    await this.connection?.close()
  }

  private async handleRPC(msg: amqplib.ConsumeMessage) {
    const { correlationId } = msg.properties
    const { procedure, payload, queue } = this.deserialize(msg.content)
    const respond = (data: any) =>
      this.channel.sendToQueue(queue, this.serialize(data), {
        correlationId,
        contentType: 'application/json',
      })

    try {
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
