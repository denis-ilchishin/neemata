interface Options {
  command: 'dev' | 'prod' | 'task'
  args: string[]
  configPath: string
  rootPath: string
  scheduler: boolean
  timeout: number
}

export const start: (options: Options) => Promise<void>
