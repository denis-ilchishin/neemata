// import { BaseTransport, BaseTransportConnection } from '@neemata/application'

// import amqplib from 'amqplib'

// export type TransportOptions = {
//   connection: amqplib.Options.Connect
//   requestQueue: string
// }

// type TransportProcedureOptions = {}
// type TransportContext = {}
// type ClientTransportContext = {
//   clientId: string
//   headers: Record<string, string>
// }

// export class AmqpTransportConnection extends BaseTransportConnection {
//   constructor(data: any) {
//     super(undefined, data)
//   }

//   send() {
//     return false
//   }
// }

// export class Transport extends BaseTransport<
//   TransportProcedureOptions,
//   TransportContext,
//   { transport: 'amqp' }
// > {
//   name = 'AMQP transport'
//   connections = new Set<AmqpTransportConnection>()
//   // new Map<
//   //   string,
//   //   {
//   //     connection: AmqpTransportConnection
//   //     interval: ReturnType<typeof setInterval>
//   //     container: Container
//   //   }
//   // >()

//   amqpConnection!: amqplib.Connection
//   amqpChannel!: amqplib.Channel

//   constructor(private readonly options: TransportOptions) {
//     super()
//   }

//   initialize() {
//     // this.application.registerHook(Hook.BeforeTerminate, async () => {
//     //   const ids = Array.from(this.connections.keys())
//     //   await Promise.allSettled(ids.map((id) => this.handleClientDisconnect(id)))
//     // })
//   }

//   async start() {
//     const { requestQueue, connection } = this.options
//     this.application.logger.debug('Connecting to RabbitMQ...')
//     this.amqpConnection = await amqplib.connect(connection)
//     this.application.logger.debug('Creating a channel...')
//     this.amqpChannel = await this.amqpConnection.createChannel()
//     await this.amqpChannel.assertQueue(requestQueue, { durable: false })
//     this.application.logger.info('Listening on [%s] queue', requestQueue)
//     const consumeOptions = { noAck: true }
//     await this.amqpChannel.consume(
//       requestQueue,
//       this.handleRPC.bind(this),
//       consumeOptions
//     )
//   }

//   async stop() {
//     await this.amqpChannel?.close()
//     await this.amqpConnection?.close()
//   }

//   private async handleRPC(msg: amqplib.ConsumeMessage | null) {
//     // if (!msg) return void 0
//     // const { correlationId, replyTo, appId, headers } = msg.properties
//     // const respond = (data: any) =>
//     //   this.amqpChannel.sendToQueue(replyTo, this.serialize(data), {
//     //     correlationId,
//     //     contentType: 'application/json',
//     //   })
//     // try {
//     //   const connection = await this.getTransportConnection(replyTo, {
//     //     clientId: appId,
//     //     headers,
//     //   })
//     //   const { procedure: name, payload } = this.deserialize(msg.content)
//     //   const procedure = await this.application.api.find(name)
//     //   const container = connection.container.createScope(Scope.Call)
//     //   const response = await this.application.api.call({
//     //     connection: connection.connection,
//     //     name,
//     //     procedure,
//     //     payload,
//     //     container,
//     //   })
//     //   respond({ response })
//     // } catch (error) {
//     //   if (!(error instanceof ApiError)) {
//     //     this.application.logger.error(error)
//     //     error = new ApiError(
//     //       ErrorCode.InternalServerError,
//     //       'Internal server error'
//     //     )
//     //   }
//     //   respond({ error })
//     // }
//   }

//   private serialize(data: any) {
//     return Buffer.from(JSON.stringify(data))
//   }

//   private deserialize(data: Buffer) {
//     return JSON.parse(data.toString())
//   }

//   private async getTransportConnection(
//     queue: string,
//     ctx: ClientTransportContext
//   ) {
//     // if (!this.connections.has(queue))
//     //   await this.createTransportConnection(queue, ctx)
//     // return this.connections.get(queue)!
//   }

//   private async createTransportConnection(
//     queue: string,
//     ctx: ClientTransportContext
//   ) {
//     // const connectionData = await this.application.api.getConnectionData(ctx)
//     // const connection = new AmqpTransportConnection(connectionData)
//     // const container = this.application.container.createScope(Scope.Connection)
//     // const interval = setInterval(async () => {
//     //   ;(await this.amqpConnection.createChannel()).assertQueue('asd', {})
//     //   const channel = await this.amqpConnection.createChannel()
//     //   await channel.checkQueue(queue).finally(() => {
//     //     channel.close()
//     //     this.handleClientDisconnect(queue)
//     //   })
//     // }, 30000)
//     // this.connections.set(queue, { connection, container, interval })
//     // return connection
//   }

//   private async handleClientDisconnect(queue: string) {
//     // if (this.connections.has(queue)) {
//     //   const client = this.connections.get(queue)!
//     //   clearInterval(client.interval)
//     //   this.connections.delete(queue)
//     //   await client.container.dispose()
//     // }
//   }

//   context(): TransportContext {
//     return {}
//   }
// }
