import {
  ApiError,
  AsProcedureOptions,
  BaseExtension,
  ErrorCode,
  ExtensionInstallOptions,
  ExtensionMiddlewareOptions,
} from '@neemata/application'
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
    options: ExtensionMiddlewareOptions<
      AsProcedureOptions<TimeoutExtensionProcedureOptions>
    >,
    payload: any,
    next: (payload?: any) => any
  ) {
    let timeout = await this.resolveProcedureOption('timeout', options)
    if (!timeout) timeout = this.defaultTimeout
    const result = next()
    const hasTimeout = timeout && timeout > 0
    const isAsync = isPromise(result)
    return hasTimeout && isAsync ? this.applyTimeout(result, timeout) : result
  }

  private applyTimeout<T>(value: Promise<T>, timeout: number): Promise<T> {
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
