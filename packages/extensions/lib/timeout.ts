import {
  AsProcedureOptions,
  BaseExtension,
  ExtensionInstallOptions,
  ExtensionMiddlewareOptions,
} from '@neemata/application'
import { ApiError, ErrorCode } from '@neemata/common'
import { isPromise } from 'util/types'

export type TimeoutExtensionProcedureOptions = {
  timeout?: number
}

export class TimeoutExtension extends BaseExtension<TimeoutExtensionProcedureOptions> {
  name = 'TimeoutExtension'

  constructor(private readonly defaultTimeout: number) {
    super()
  }

  install({ registerMiddleware }: ExtensionInstallOptions) {
    registerMiddleware('*', this.middleware.bind(this))
  }

  private async middleware(
    arg: ExtensionMiddlewareOptions<
      AsProcedureOptions<TimeoutExtensionProcedureOptions>
    >,
    data: any,
    next: (data?: any) => any
  ) {
    let timeout = await this.resolveProcedureOption('timeout', arg, data)
    if (!timeout) timeout = this.defaultTimeout
    const result = next()
    const needToAwait = timeout && timeout > 0 && isPromise(result)
    return needToAwait ? await this.awaitWithTimeout(result, timeout) : result
  }

  private awaitWithTimeout<T>(value: Promise<T>, timeout: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeoutError = new ApiError(
        ErrorCode.RequestTimeout,
        'Request Timeout'
      )
      const timer = setTimeout(reject, timeout, timeoutError)
      const clearTimer = () => clearTimeout(timer)
      value.finally(clearTimer).then(resolve).catch(reject)
    })
  }
}
