import {
  ApiError,
  BaseClient,
  BaseTransport,
  Container,
  ErrorCode,
  ExtensionInstallOptions,
  Hook,
  ProviderDeclaration,
  Scope,
} from '@neemata/application'

import amqplib from 'amqplib'

export type TransportOptions<ClientData> = {
  connection: amqplib.Options.Connect
  requestQueue: string
  clientProvider?: ProviderDeclaration<ClientData>
}

type TransportProcedureOptions = {}
type TransportContext = {
  // connection: amqplib.Connection
}

export class AmqpClient<Data = any> implements BaseClient<Data> {
  constructor() {}

  id: string
  send: (eventName: string, payload: any) => boolean
  data: Data
}

export class Transport<ClientData> extends BaseTransport<
  TransportProcedureOptions,
  TransportContext
> {
  name = 'AMQP transport'
  clients = new Map<
    string,
    {
      client: AmqpClient
      interval: ReturnType<typeof setInterval>
      container: Container
    }
  >()

  application!: ExtensionInstallOptions<
    TransportProcedureOptions,
    TransportContext
  >
  connection!: amqplib.Connection
  channel!: amqplib.Channel

  constructor(private readonly options: TransportOptions<ClientData>) {
    super()
  }

  install(
    application: ExtensionInstallOptions<
      TransportProcedureOptions,
      TransportContext
    >
  ) {
    this.application = application
    this.application.registerHook(Hook.BeforeTerminate, async () => {
      const ids = Array.from(this.clients.keys())
      await Promise.allSettled(ids.map((id) => this.handleClientDisconnect(id)))
    })
  }

  async start() {
    const { requestQueue, connection } = this.options
    this.application.logger.debug('Connecting to RabbitMQ...')
    this.connection = await amqplib.connect(connection)
    this.application.logger.debug('Creating a channel...')
    this.channel = await this.connection.createChannel()
    await this.channel.assertQueue(requestQueue, { durable: false })
    this.application.logger.info('Listening on [%s] queue', requestQueue)
    const consumeOptions = { noAck: true }
    await this.channel.consume(
      requestQueue,
      this.handleRPC.bind(this),
      consumeOptions
    )
  }

  async stop() {
    await this.channel?.close()
    await this.connection?.close()
  }

  private async handleRPC(msg: amqplib.ConsumeMessage) {
    const { correlationId, replyTo } = msg.properties
    const client = this.getClient(replyTo)
    const respond = (data: any) =>
      this.channel.sendToQueue(replyTo, this.serialize(data), {
        correlationId,
        contentType: 'application/json',
      })

    try {
      const { procedure, payload } = this.deserialize(msg.content)
      const declaration = await this.application.api.find(procedure)
      const container = client.container.createScope(Scope.Call)
      const response = await this.application.api.call({
        client: client.client,
        name: procedure,
        declaration,
        payload,
        container,
      })
      respond({ response })
    } catch (error) {
      if (!(error instanceof ApiError)) {
        this.application.logger.error(error)
        error = new ApiError(
          ErrorCode.InternalServerError,
          'Internal server error'
        )
      }
      respond({ error })
    }
  }

  private serialize(data: any) {
    return Buffer.from(JSON.stringify(data))
  }

  private deserialize(data: Buffer) {
    return JSON.parse(data.toString())
  }

  private getClient(queue: string) {
    if (!this.clients.has(queue)) this.createClient(queue)
    return this.clients.get(queue)
  }

  private createClient(queue: string) {
    const client = new AmqpClient()
    const container = this.application.container.createScope(Scope.Connection)
    const interval = setInterval(async () => {
      const channel = await this.connection.createChannel()
      await channel.checkQueue(queue).finally(() => {
        channel.close()
        this.handleClientDisconnect(queue)
      })
    }, 30000)
    this.clients.set(queue, { client, container, interval })
    return client
  }

  private async handleClientDisconnect(queue: string) {
    if (this.clients.has(queue)) {
      const client = this.clients.get(queue)
      clearInterval(client.interval)
      this.clients.delete(queue)
      await client.container.dispose()
    }
  }

  context(): TransportContext {
    return {}
  }
}
