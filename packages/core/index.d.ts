interface Options {
  command: 'dev' | 'prod' | 'task'
  args: string[]
  configPath: string
  rootPath: string
  scheduler: boolean
  timeout: number
}

export const start: (options: Options) => Promise<void>

export { ApiException } from './lib/protocol/exceptions'
export { UserApplication } from './types/external'
