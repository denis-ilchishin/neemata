'use strict'

const WorkerMessage = Object.freeze({
  Startup: 'startup',
  Shutdown: 'shutdown',
  Invoke: 'invoke',
  Result: 'result',
  Reload: 'reload',
  Log: 'log',
  CreateLog: 'create_log',
})

module.exports = { WorkerMessage }
