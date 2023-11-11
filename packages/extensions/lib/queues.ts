import {
  AsProcedureOptions,
  BaseExtension,
  ExtensionMiddlewareOptions,
  Pattern,
  match,
} from '@neemata/application'
import { ApiError, ErrorCode } from '@neemata/common'
import { Semaphore, SemaphoreError } from './utils'

export type QueueOptions = {
  concurrency: number
  size: number
  timeout: number
}
export type QueuesExtensionOptions = {
  queues: [[Pattern, QueueOptions]]
}
export type QueuesExtensionContext = {}
export type QueuesExtensionProcedureOptions = {}

export class QueuesExtension extends BaseExtension<
  QueuesExtensionProcedureOptions,
  QueuesExtensionContext
> {
  name = 'QueuesExtension'

  private queues: Map<Pattern, Semaphore>

  constructor(options: QueuesExtensionOptions) {
    super()

    this.queues = new Map(
      options.queues.map(([pattern, { concurrency, size, timeout }]) => [
        pattern,
        new Semaphore(concurrency, size, timeout),
      ])
    )
  }

  install({ registerMiddleware }: any) {
    registerMiddleware('*', this.middleware.bind(this))
  }

  async middleware(
    arg: ExtensionMiddlewareOptions<
      AsProcedureOptions<QueuesExtensionProcedureOptions>,
      QueuesExtensionContext
    >,
    payload: any,
    next: (payload?: any) => any
  ) {
    let queue: Semaphore

    for (const [pattern, _queue] of this.queues) {
      if (match(arg.name, pattern)) {
        queue = _queue
        break
      }
    }

    if (!queue) return next()

    try {
      await queue.enter()
      return next()
    } catch (error) {
      if (error instanceof SemaphoreError)
        throw new ApiError(ErrorCode.ServiceUnavailable, 'Server is too busy')
      throw error
    } finally {
      queue.leave()
    }
  }
}
