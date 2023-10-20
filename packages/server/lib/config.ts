import { createLogger } from './logger'

export class Config {
  port: number | string
  hostname: string
  https: import('uWebSockets.js').AppOptions
  qsOptions?: import('qs').IParseOptions
  maxPayloadLength: number
  maxStreamChunkLength: number
  api: {
    timeout: number
    queue?: {
      concurrency: number
      size: number
      timeout: number
    }
  }
  applicationPath: string
  workers: {
    number: number
    timeout: number
  }
  errorHandlers: ErrorHandler[]
  procedures: string
  tasks?: string
  logger: ReturnType<typeof createLogger>

  constructor(private readonly options: ApplicationOptions) {
    this.port = options.server?.port ?? 42069
    this.hostname = options.server?.hostname || '0.0.0.0'
    this.https = options.server?.https
    this.maxPayloadLength = options.server?.maxPayloadLength || 16 * 1024 * 1024
    this.maxStreamChunkLength =
      options.server?.maxStreamChunkLength || 512 * 1024
    this.api = {
      timeout: 15000,
      ...options.api,
    }
    this.applicationPath = options.applicationPath
    this.workers = options.workers
    this.errorHandlers = options.errorHandlers ?? []
    this.procedures = options.procedures
    this.tasks = options.tasks
    this.qsOptions = options.server?.qsOptions ?? {}
    this.logger = createLogger(options.logging?.level || 'info')
  }
}
