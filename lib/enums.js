'use strict'

const WorkerType = Object.freeze({
  Api: 'Api',
  Task: 'Task',
  OneOff: 'OneOff',
})

const WorkerMessage = Object.freeze({
  Startup: 'Startup',
  Shutdown: 'Shutdown',
  Invoke: 'Invoke',
  Result: 'Result',
  Reload: 'Reload',
  Log: 'Log',
  CreateLog: 'CreateLog',
})

const Transport = Object.freeze({
  Ws: 'Ws',
  Http: 'Http',
})

const ErrorCode = Object.freeze({
  ValidationError: 'VALIDATION_ERROR',
  BadRequest: 'BAD_REQUEST',
  NotFound: 'NOT_FOUND',
  Forbidden: 'FORBIDDEN',
  Unauthorized: 'UNAUTHORIZED',
  InternalServerError: 'INTERNAL_SERVER_ERROR',
  GatewayTimeout: 'GATEWAY_TIMEOUT',
})

module.exports = {
  WorkerType,
  WorkerMessage,
  Transport,
  ErrorCode,
}
