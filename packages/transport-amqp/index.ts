import {
  ApiError,
  BaseTransport,
  BaseTransportClient,
  Container,
  ErrorCode,
  Hook,
  Scope,
} from '@neemata/application'

import amqplib from 'amqplib'

export type TransportOptions = {
  connection: amqplib.Options.Connect
  requestQueue: string
}

type TransportProcedureOptions = {}
type TransportContext = {}
type ClientTransportContext = {
  clientId: string
  headers: Record<string, string>
}

export class AmqpClient extends BaseTransportClient {
  readonly protocol = 'amqp'

  constructor(data: any) {
    super(undefined, data, 'amqp')
  }

  _handle(eventName: string, payload: any) {
    return false
  }
}

export class Transport extends BaseTransport<
  TransportProcedureOptions,
  TransportContext,
  AmqpClient
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

  connection!: amqplib.Connection
  channel!: amqplib.Channel

  constructor(private readonly options: TransportOptions) {
    super()
  }

  initialize() {
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

  private async handleRPC(msg: amqplib.ConsumeMessage | null) {
    if (!msg) return void 0

    const { correlationId, replyTo, appId, headers } = msg.properties
    const respond = (data: any) =>
      this.channel.sendToQueue(replyTo, this.serialize(data), {
        correlationId,
        contentType: 'application/json',
      })

    try {
      const client = await this.getClient(replyTo, { clientId: appId, headers })
      const { procedure: name, payload } = this.deserialize(msg.content)
      const procedure = await this.application.api.find(name)
      const container = client.container.createScope(Scope.Call)
      const response = await this.application.api.call({
        client: client.client,
        name,
        procedure,
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

  private async getClient(queue: string, ctx: ClientTransportContext) {
    if (!this.clients.has(queue)) await this.createClient(queue, ctx)
    return this.clients.get(queue)!
  }

  private async createClient(queue: string, ctx: ClientTransportContext) {
    const clientData = await this.application.api.getClientData(ctx)
    const client = new AmqpClient(clientData)
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
      const client = this.clients.get(queue)!
      clearInterval(client.interval)
      this.clients.delete(queue)
      await client.container.dispose()
    }
  }

  context(): TransportContext {
    return {}
  }
}
