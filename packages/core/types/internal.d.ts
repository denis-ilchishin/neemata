export declare interface NeemataWorkerData {
  type: import('@neemata/common').ValueOf<
    typeof import('@neemata/common').WorkerType
  >
  port?: number
  isDev: boolean
  isProd: boolean
  config: NeemataConfig
  rootPath: string
}

export declare type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export declare interface NeemataConfig {
  workers: number
  ports: number[]
  api: {
    /**
     * @default "0.0.0.0"
     */
    hostname: string
    /**
     * @default "/api"
     */
    baseUrl: string
    cors: import('@fastify/cors').FastifyCorsOptions
    multipart: import('@fastify/multipart').FastifyMultipartOptions
  }
  log: {
    basePath: string
    level: LogLevel
  }
  auth: {
    service: string
  }
  timeouts: {
    /**
     * @default 10000
     */
    startup: number
    /**
     * @default 10000
     */
    shutdown: number
    /**
     * @default 250
     */
    hrm: number
    /**
     * @default 5000
     */
    request: number
    task: {
      /**
       * @default 15000
       */
      execution: number
      /**
       * @default 30000
       */
      allocation: number
    }
  }
  intervals: {
    /**
     * @default 30000
     */
    ping: number
  }
  scheduler: {
    tasks: Array<{
      name: string
      task: string
      cron: string
      timeout: number
      args?: any[]
    }>
  }
}

export declare type Guard = <Auth = any>(options: {
  readonly req: import('fastify').FastifyRequest
  readonly auth: Auth | null
}) => boolean | Promise<boolean>

export declare type Client<Auth = any | null> =
  import('events').EventEmitter & {
    readonly id: string
    readonly auth: Auth
    readonly send: (event: string, data: any) => void
    readonly opened: boolean
    readonly openedAt: Date
    readonly closedAt: Date | null
  }
