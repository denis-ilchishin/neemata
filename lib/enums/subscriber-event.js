const SubscriberEvent = Object.freeze({
  Join: Symbol('Join'),
  Leave: Symbol('Leave'),
  Remove: Symbol('Remove'),
  Message: Symbol('Message'),
})

const SubscriberEventType = Object.freeze({
  RoomMessage: 'room-message',
  ServerMessage: 'server-message',
})

module.exports = {
  SubscriberEvent,
  SubscriberEventType,
}
