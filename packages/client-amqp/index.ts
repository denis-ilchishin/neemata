// import {
//   ApiError,
//   BaseClient,
//   Call,
//   ErrorCode,
//   ResolveApiProcedureType,
// } from '@neemata/common'
// import amqplib from 'amqplib'
// import { hostname } from 'node:os'

// export { AmqpClient, ApiError, ErrorCode }

// type Options = {
//   connection: amqplib.Options.Connect
//   requestQueue: string
//   debug?: boolean
//   timeout?: number
//   clientId?: string
//   headers?: Record<string, string>
// }

// type RPCOptions = {
//   timeout?: number
// }

// class AmqpClient<
//   Procedures extends any = never,
//   Events extends Record<string, any> = Record<string, any>
// > extends BaseClient<Procedures, Events, RPCOptions> {
//   private connection!: amqplib.Connection
//   private channel!: amqplib.Channel
//   private queue!: string
//   private callId = 0
//   private calls = new Map<string, Call>()
//   private clientId: string

//   constructor(private readonly options: Options) {
//     super()
//     this.clientId = options.clientId || hostname()
//   }

//   async connect() {
//     this.connection = await amqplib.connect(this.options.connection)
//     this.channel = await this.connection.createChannel()

//     await this.channel.checkQueue(this.options.requestQueue)
//     const { queue } = await this.channel.assertQueue('', {
//       durable: false,
//       autoDelete: true,
//       exclusive: true,
//     })

//     this.queue = queue

//     this.channel.consume(
//       this.queue,
//       (msg) => {
//         if (!msg) return void 0
//         const { correlationId } = msg.properties
//         const call = this.calls.get(correlationId)
//         if (!call) return
//         const { resolve, reject, timer } = call
//         try {
//           const { response, error } = this.deserialize(msg.content)
//           if (error) reject(new ApiError(error.code, error.message, error.data))
//           else resolve(response)
//         } catch (error) {
//           reject(error)
//         } finally {
//           if (timer) clearTimeout(timer)
//           this.calls.delete(correlationId)
//         }
//       },
//       { noAck: true }
//     )

//     this.connection.once('error', (error) => {
//       console.error(error)
//       this.clear(new ApiError('Connection error', 'Connection error'))
//       this.connect()
//     })

//     this.emit('_neemata:open')
//   }

//   async disconnect() {
//     this.clear(new ApiError(ErrorCode.ConnectionError, 'Connection closed'))
//     await this.channel?.close()
//     await this.connection?.close()
//     this.emit('_neemata:close')
//   }

//   async reconnect(): Promise<void> {
//     await this.disconnect()
//     await this.connect()
//   }

//   rpc<P extends keyof Procedures>(
//     procedure: P,
//     ...args: Procedures extends never
//       ? [any?, RPCOptions?]
//       : null extends ResolveApiProcedureType<Procedures, P, 'input'>
//       ? [ResolveApiProcedureType<Procedures, P, 'input'>?, RPCOptions?]
//       : [ResolveApiProcedureType<Procedures, P, 'input'>, RPCOptions?]
//   ): Promise<
//     Procedures extends never
//       ? any
//       : ResolveApiProcedureType<Procedures, P, 'output'>
//   > {
//     const [payload, options = {}] = args
//     const { timeout = this.options.timeout } = options
//     // TODO: implement AMQP message timeout
//     const correlationId = (this.callId++).toString()
//     this.channel.sendToQueue(
//       this.options.requestQueue,
//       this.serialize({
//         procedure,
//         payload,
//       }),
//       {
//         contentType: 'application/json',
//         correlationId,
//         replyTo: this.queue,
//         appId: this.clientId,
//         headers: this.options.headers,
//       }
//     )

//     return new Promise((resolve, reject) => {
//       const timer = timeout
//         ? setTimeout(() => {
//             reject(new ApiError(ErrorCode.RequestTimeout, 'Request timeout'))
//             this.calls.delete(correlationId)
//           }, timeout)
//         : null
//       this.calls.set(correlationId, { resolve, reject, timer })
//     })
//   }

//   private serialize(data: any) {
//     return Buffer.from(JSON.stringify(data))
//   }

//   private deserialize(data: Buffer) {
//     return JSON.parse(data.toString())
//   }

//   private clear(error) {
//     for (const { reject, timer } of this.calls.values()) {
//       if (timer) clearTimeout(timer)
//       reject(error)
//     }
//     this.calls.clear()
//   }
// }
