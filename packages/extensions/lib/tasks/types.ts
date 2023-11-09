import {
  Depender,
  Logger,
  OmitFirstItem,
  ProviderDeclaration,
} from '@neemata/application'
import { Scope } from '@neemata/common'

export type TaskContext = {
  signal: AbortSignal
  logger: Logger
}

export type Task<Context> = (context: Context, ...args: any[]) => any

export type TaskDependencies = Record<
  string,
  ProviderDeclaration<any, any, any, (typeof Scope)['Global']>
>

export interface TaskDeclaration<
  Deps extends TaskDependencies,
  Context,
  T extends Task<Context>
> extends Depender<Deps> {
  task: T
  name?: string
  parse?: (
    args: string[],
    kwargs: Record<string, string>
  ) => OmitFirstItem<Parameters<T>>
}

export type TaskInterface<Res> = {
  result: Promise<Res>
  taskId: string
  abort: () => void
}

export const WorkerEvent = Object.freeze({
  Ready: 'ready',
  Stop: 'stop',
  Error: 'error',
  Invoke: 'invoke',
  Abort: 'abort',
})
export type WorkerEvent = (typeof WorkerEvent)[keyof typeof WorkerEvent]
