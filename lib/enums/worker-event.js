const WorkerEvent = Object.freeze({
  Startup: 'startup',
  Shutdown: 'shutdown',
  Reload: 'reload',
  TaskInvoke: 'task-invoke',
  TaskResponse: 'task-response',
  ServerPropagateMessage: 'server-propagate-message',
  Log: 'log',
})

module.exports = {
  WorkerEvent,
}
