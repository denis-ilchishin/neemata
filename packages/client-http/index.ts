import {
  ApiError,
  BaseClient,
  ErrorCode,
  ResolveProcedureApiType,
} from '@neemata/common'

export { ApiError, ErrorCode, HttpClient }

type Options = {
  host: string
  secure?: boolean
  timeout?: number
  debug?: boolean
}

type RPCOptions = {
  timeout?: number
}

class HttpClient<Api extends any = never> extends BaseClient<Api, RPCOptions> {
  private readonly url: URL
  private URLParams: URLSearchParams = new URLSearchParams()

  constructor(private readonly options: Options) {
    super()
    const schema = (schema: string) => schema + (options.secure ? 's' : '')
    this.url = new URL(`${schema('http')}://${options.host}`)
  }

  async connect() {
    return void 0
  }

  async disconnect() {
    return void 0
  }

  async reconnect(urlParams?: URLSearchParams) {
    await this.disconnect()
    if (urlParams) this.setGetParams(urlParams)
    await this.connect()
  }

  async rpc<P extends keyof Api>(
    procedure: P,
    ...args: Api extends never
      ? [any?, RPCOptions?]
      : null extends ResolveProcedureApiType<Api, P, 'input'>
      ? [ResolveProcedureApiType<Api, P, 'input'>?, RPCOptions?]
      : [ResolveProcedureApiType<Api, P, 'input'>, RPCOptions?]
  ): Promise<
    Api extends never ? any : ResolveProcedureApiType<Api, P, 'output'>
  > {
    const [payload, options = {}] = args
    const { timeout = options.timeout } = options
    const signal = timeout ? AbortSignal.timeout(timeout) : undefined
    return await fetch(
      this.applyURLParams(new URL(`api/${procedure as string}`, this.url)),
      {
        signal,
        method: 'POST',
        body: JSON.stringify(payload),
        credentials: 'include',
        cache: 'no-cache',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )
      .then((res) => res.json())
      .then(({ response, error }) => {
        if (error) throw new ApiError(error.code, error.message, error.data)
        return response
      })
  }

  setGetParams(params: URLSearchParams) {
    this.URLParams = params
  }

  private applyURLParams(url: URL) {
    for (const [key, value] of this.URLParams.entries())
      url.searchParams.set(key, value)
    return url
  }
}
