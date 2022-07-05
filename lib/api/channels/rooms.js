// const { EventEmitter } = require('stream')
// const {
//   SubscriberEvent,
//   SubscriberEventType,
// } = require('../../enum/subscriber-event')

// class Rooms extends EventEmitter {
//   rooms = new Map()

//   constructor(channel) {
//     super()
//     this.channel = channel
//     this.redis = channel.application.redis

//     this.redis.on(SubscriberEventType.RoomMessage, ({ roomId, ...message }) => {
//       this.send(roomId, message)
//     })
//   }

//   get(roomId) {
//     if (!this.rooms.has(roomId)) {
//       const room = new Set()
//       this.rooms.set(roomId, room)
//       return room
//     } else {
//       return this.rooms.get(roomId)
//     }
//   }

//   join(roomId, socket) {
//     const room = this.get(roomId)
//     room.add(socket)
//     this.emit(SubscriberEvent.Join, room, socket)
//     this.channel.send(socket, {
//       type: 'room',
//       payload: { action: 'join', room: roomId },
//     })
//   }

//   leave(roomId, socket) {
//     const room = this.rooms.get(roomId)
//     if (room) {
//       room.delete(socket)
//       this.emit(SubscriberEvent.Leave, room, socket)
//       this.channel.send(socket, {
//         type: 'room',
//         payload: { action: 'leave', room: roomId },
//       })
//     }

//     // if (!room.clients.length) {
//     //   this.remove(roomId)
//     // }
//   }

//   remove(roomId) {
//     if (this.rooms.has(roomId)) {
//       // const { clients } = this.rooms.get(roomId)
//       this.rooms.delete(roomId)
//       this.redis.off(SubscriberEventType.RoomMessage)
//       this.emit(SubscriberEvent.Remove, roomId)
//     }
//   }

//   message(roomId, { event, data }) {
//     if (roomId && event) {
//       this.redis.emit(SubscriberEventType.RoomMessage, {
//         roomId,
//         event,
//         data,
//       })
//     }
//   }

//   send(roomId, { event, data }) {
//     const room = this.rooms.get(roomId)
//     if (room) {
//       for (const client of room) {
//         this.channel.send(client, {
//           type: 'room',
//           payload: { action: 'message', room: roomId, event, data },
//         })
//       }
//     }
//   }
// }

// module.exports = {
//   Rooms,
// }
