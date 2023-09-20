// import { type StreamMeta } from '@neemata/common'
// import { ServerWebSocket } from 'bun'
// import { PassThrough } from 'node:stream'

// export class Stream extends PassThrough {
//   id: string
//   meta: StreamMeta
//   websocket: any
//   #pulled: boolean

//   constructor(options: { websocket: ServerWebSocket; id: string; meta: StreamMeta }) {
//     super({ allowHalfOpen: false })

//     this.id = options.id
//     this.meta = options.meta
//     this.websocket = options.websocket
//     this.#pulled = false
//   }

//   _read() {
//     if (this.#pulled) return
//     this.websocket.send('neemata/stream/pull', { id: this.id })
//     this.#pulled = true
//   }

//   _write(chunk: Buffer, encoding: BufferEncoding, callback: Function) {
//     this.push(chunk, encoding)
//     callback()
//   }

//   done() {
//     if (this.readableEnded) return
//     return new Promise((resolve, reject) => {
//       this.once('end', resolve)
//       this.once('error', reject)
//     })
//   }

//   toBuffer() {
//     return new Promise((res, rej) => {
//       const chunks: Buffer[] = []
//       this.on('data', (chunk) => chunks.push(chunk))
//       this.once('end', () => res(Buffer.concat(chunks)))
//       this.once('error', (err) => rej(err))
//       this.read()
//     })
//   }

//   toString() {
//     return 'neemata/stream/' + this.id
//   }

//   toJSON() {
//     return this.toString()
//   }
// }
