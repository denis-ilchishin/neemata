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
    basePath: string
    cors: {
      origin: string
    }
    queue: {
      concurrency: number
      size: number
    }
    auth: {
      /**
       * @default 'auth.api'
       */
      service: string
    }
    /**
     * @default 'zod'
     */
    schema: 'zod' | 'zod-format' | 'zod-flatten'
  }
  log: {
    basePath: string
    level: LogLevel
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
    hmr: number
    rpc: {
      /**
       * @default 15000
       */
      execution: number
      /**
       * @default 30000
       */
      queue: number
    }
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
