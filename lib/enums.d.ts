export const WorkerType = {
  Api: 'Api',
  Task: 'Task',
  OneOff: 'OneOff',
} as const

export const WorkerMessage = {
  Startup: 'Startup',
  Shutdown: 'Shutdown',
  Invoke: 'Invoke',
  Result: 'Result',
  Reload: 'Reload',
  CreateLog: 'CreateLog',
  Log: 'Log',
} as const

export const Transport = {
  Ws: 'Ws',
  Http: 'Http',
} as const

export const ErrorCode = {
  ValidationError: 'VALIDATION_ERROR',
  BadRequest: 'BAD_REQUEST',
  NotFound: 'NOT_FOUND',
  Forbidden: 'FORBIDDEN',
  Unauthorized: 'UNAUTHORIZED',
  InternalServerError: 'INTERNAL_SERVER_ERROR',
  GatewayTimeout: 'GATEWAY_TIMEOUT',
} as const
