const WorkerEvent = Object.freeze({
  Start: 'start',
  Stop: 'stop',
  TaskInvoke: 'task-invoke',
  TaskResponse: 'task-response',
  ServerPropagateMessage: 'server-propagate-message',
})

module.exports = {
  WorkerEvent,
}
