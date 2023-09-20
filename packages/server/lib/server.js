import {
  ApiError,
  ErrorCode,
  MessageType,
  STREAM_ID_PREFIX,
  StreamsPayloadView,
  concat,
  encodeBigNumber,
  encodeNumber,
  encodeText,
} from '@neemata/common'
import EventEmitter from 'node:events'
import { PassThrough } from 'node:stream'
import qs from 'qs'
import uws from 'uWebSockets.js'
import { Scope } from './container.js'
import { SemaphoreError, createSemaphore } from './semaphore.js'

/** @typedef {ReturnType<typeof createServer>} Server */
/** @typedef {uws.HttpRequest} Req */
/** @typedef {uws.HttpResponse} Res */

const AUTH_KEY = Symbol('auth')
const HTTP_SUFFIX = '\r\n\r\n'
const CONTENT_TYPE_HEADER = 'Content-Type'
const CHARSET_SUFFIX = 'charset=utf-8'
const JSON_CONTENT_TYPE_MIME = 'application/json'
const PLAIN_CONTENT_TYPE_MIME = 'text/plain'
const HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Credentials': 'true',
}
const InternalError = new ApiError(
  ErrorCode.InternalServerError,
  'Internal Server Error'
)

const NotFoundError = new ApiError(ErrorCode.NotFound, 'Not Found')
/**
 * @param {import('./config').Config} config
 * @param {import('./api').Api} api
 * * @param {import('./container.js').Container} container
 */
export const createServer = (config, api, container) => {
  /** @type {uws.us_listen_socket | undefined} */
  let socket
  const basePath = (...parts) => [config.basePath, ...parts].join('/')
  const server = config.https ? uws.SSLApp({}) : uws.App()

  const websockets = new Map()

  const serialize = (data, receiver) => JSON.stringify(data, receiver)
  const deserialize = (data, receiver) => JSON.parse(data, receiver)

  const semaphore = config.rpc
    ? createSemaphore(
        config.rpc.concurrency,
        config.rpc.size,
        config.rpc.timeout
      )
    : null

  /**
   * @param {Res} res
   * @param {Record<string, any>} headers
   */
  const setCors = (res, headers) => {
    const origin = headers['origin']
    if (origin) res.writeHeader('Access-Control-Allow-Origin', origin)
  }

  const throttle = async (cb) => {
    if (!semaphore) return cb()
    try {
      await semaphore.enter()
      return await cb()
    } catch (error) {
      if (error instanceof SemaphoreError)
        throw new ApiError(ErrorCode.ServiceUnavailable, 'Server is too busy')
      else throw error
    } finally {
      await semaphore.leave()
    }
  }

  /**
   * @param {string} name
   * @param {import('./container.js').Container} container
   * @param {any} payload
   */
  const handleRPC = async (name, container, payload) => {
    try {
      return await throttle(async () => {
        const { handle, input, output } = await api.get(container, name)
        const data = input ? await input(payload) : payload
        const response = await handle(data)
        return output ? await output(response) : response
      })
    } catch (error) {
      throw api.handleError(error)
    }
  }

  const bodyHandler = (req, res, method, query) => {
    if (method === 'post')
      return createBody(req, res).toJSON().then(deserialize)
    else return query
  }

  const responseHandler = (req, res, headers, data) => {
    setDefaultHeaders(res)
    setCors(res, headers)
    res.end(serialize(data))
  }

  /**
   * @param {Req} req
   * @param {Res} res
   */
  const handleHTTP = async (res, req) => {
    if (!socket) return void res.close()

    let isAborted = false
    res.onAborted(() => (isAborted = true))

    const tryRespond = (cb) => {
      if (!isAborted) res.cork(cb)
    }

    const method = req.getMethod()
    const query = qs.parse(req.getQuery(), config.qsOptions)
    const headers = getRequestHeaders(req)
    const proxyRemoteAddress = Buffer.from(
      res.getProxiedRemoteAddressAsText()
    ).toString()
    const remoteAddress = Buffer.from(res.getRemoteAddressAsText()).toString()
    const url = getRequestUrl(req)

    try {
      const procedure = url.pathname.substring(basePath('api').length + 1)
      const body = await bodyHandler(res, req, method, query)

      let params = {
        headers,
        query,
        proxyRemoteAddress,
        remoteAddress,
      }
      const scopeContainer = container.copy(Scope.Connection, params)
      await scopeContainer.load()

      params = {
        ...params,
        procedure,
      }
      const callContainer = scopeContainer.copy(Scope.Call, params)
      await callContainer.load()

      const respose = await handleRPC(procedure, callContainer, body)
      tryRespond(() => responseHandler(req, res, headers, respose))

      await scopeContainer.dispose()
      await callContainer.dispose()
    } catch (cause) {
      tryRespond(() => {
        if (cause instanceof ApiError) {
          res.writeStatus('400 Bad Request')
          responseHandler(req, res, headers, cause)
        } else {
          console.error('Unexpected error', { cause })
          res.writeStatus('500 Internal Server Error')
          responseHandler(req, res, headers, InternalError)
        }
      })
    }
  }

  server.options(basePath('*'), (res, req) => {
    if (!socket) return void res.close()
    const headers = getRequestHeaders(req)
    setDefaultHeaders(res)
    setCors(res, headers)
    res.writeStatus('204 No Content')
    res.endWithoutBody()
  })

  server.post(basePath('api', '*'), handleHTTP)
  server.get(basePath('api', '*'), handleHTTP)
  server.get(basePath('health'), (res, req) => {
    if (!socket) return void res.close()
    const headers = getRequestHeaders(req)
    setDefaultHeaders(res)
    setCors(res, headers)
    res.end('OK')
  })

  server.any('/*', (res, req) => {
    if (!socket) return void res.close()
    const headers = getRequestHeaders(req)
    setDefaultHeaders(res)
    setCors(res, headers)
    res.writeStatus('404 Not Found')
    const acceptContentTypes = req.getHeader('accept').split(',')
    if (acceptContentTypes.includes(JSON_CONTENT_TYPE_MIME)) {
      res.end(serialize())
    } else {
      res.end('Not Found')
    }
  })

  /**
   * @param {uws.WebSocket} ws
   * @param {Buffer} payloadBuf
   */
  const handleWSRPC = async (ws, payloadBuf) => {
    const { streams } = ws.getUserData()
    const streamsPayloadLength = payloadBuf
      .subarray(0, StreamsPayloadView.BYTES_PER_ELEMENT)
      .readUint32LE()

    const streamsPayload = deserialize(
      payloadBuf.subarray(
        Uint32Array.BYTES_PER_ELEMENT,
        Uint32Array.BYTES_PER_ELEMENT + streamsPayloadLength
      )
    )

    for (const stream of streamsPayload) {
      const { id, ...meta } = stream
      streams.set(id.toString(), createStream(ws, id, meta))
    }

    const rpcPayload = deserialize(
      payloadBuf.subarray(Uint32Array.BYTES_PER_ELEMENT + streamsPayloadLength),
      (key, value) => {
        if (typeof value === 'string' && value.startsWith(STREAM_ID_PREFIX)) {
          return streams.get(value.slice(STREAM_ID_PREFIX.length))
        }
        return value
      }
    )

    const type = encodeNumber(MessageType.RPC, Uint8Array)

    let { container, params } = ws.getUserData()
    const { procedure, payload, callId } = rpcPayload

    const scopeContainer = container.copy(Scope.Call, { ...params, procedure })

    try {
      await scopeContainer.load()
      const response = await handleRPC(procedure, scopeContainer, payload)
      ws.send(concat(type, encodeText(serialize({ callId, response }))), true)
    } catch (error) {
      if (error instanceof ApiError) {
        ws.send(concat(type, encodeText(serialize({ callId, error }))), true)
      } else {
        console.error('Unexpected error', { cause: error })
        ws.send(concat(type, encodeText(serialize(InternalError))), true)
      }
    } finally {
      await scopeContainer.dispose()
    }
  }

  server.ws(basePath('api'), {
    maxPayloadLength: 16 * 1024 * 1024,
    upgrade: async (res, req, socket) => {
      if (!socket) return void res.close()
      let isAborted = false
      res.onAborted(() => (isAborted = true))

      const headers = getRequestHeaders(req)
      const proxyRemoteAddress = Buffer.from(
        res.getProxiedRemoteAddressAsText()
      ).toString()
      const remoteAddress = Buffer.from(res.getRemoteAddressAsText()).toString()
      const query = qs.parse(req.getQuery(), config.qsOptions)

      const secKey = headers['sec-websocket-key']
      const secProtocol = headers['sec-websocket-protocol']
      const secExtensions = headers['sec-websocket-extensions']

      const streams = new Map()
      const events = new EventEmitter()

      const params = { headers, query, proxyRemoteAddress, remoteAddress }
      const scopeContainer = container.copy(Scope.Connection, params)
      try {
        await scopeContainer.load()
        if (isAborted) throw new Error('Aborted')
        res.cork(() => {
          res.upgrade(
            { streams, container: scopeContainer, params, events },
            secKey,
            secProtocol,
            secExtensions,
            socket
          )
        })
      } catch (error) {
        res.close()
        if (error.message === 'Aborted') await scopeContainer.dispose()
      }
    },
    open: (ws) => {
      const { events } = ws.getUserData()
      events.on(MessageType.RPC, handleWSRPC)
      events.on(MessageType.STREAM_PUSH, (ws, buffer) => {
        const { streams } = ws.getUserData()
        const id = buffer.readUint32LE()
        const stream = streams.get(id.toString())
        if (!stream) ws.close()
        const chunk = buffer.subarray(Uint32Array.BYTES_PER_ELEMENT)
        console.log(chunk.byteLength)
        stream.push(chunk)
        stream.emit('received', chunk.byteLength)
      })
      events.on(MessageType.STREAM_END, (ws, buffer) => {
        const { streams } = ws.getUserData()
        const id = buffer.readUint32LE().toString()
        const stream = streams.get(id)
        if (!stream) return void ws.close()
        stream.end()
        streams.delete(id)
      })
      events.on(MessageType.STREAM_TERMINATE, (ws, buffer) => {
        const { streams } = ws.getUserData()
        const id = buffer.readUint32LE().toString()
        const stream = streams.get(id)
        if (!stream) ws.close()
        stream.destroy(new Error('Termiated by client'))
        streams.delete(id)
      })
    },
    message: (ws, message, isBinary) => {
      try {
        if (!isBinary) ws.close()
        const { events } = ws.getUserData()
        const buf = Buffer.from(message)
        const type = buf.subarray(0, Uint8Array.BYTES_PER_ELEMENT).readUint8()
        const buffer = buf.subarray(Uint8Array.BYTES_PER_ELEMENT)
        console.debug({ type })
        events.emit(type, ws, buffer)
      } catch (error) {
        console.error(error)
      }
    },
    close: async (ws, code, message) => {
      console.error([code, Buffer.from(message).toString()])
      const { container, streams } = ws.getUserData()
      for (const stream of streams.values()) stream.destroy()
      streams.clear()
      await container.dispose()
    },
  })

  const start = async () => {
    const _socket = await new Promise((r) =>
      server.listen(config.hostname, config.port, r)
    )
    socket = _socket
    console.log(`Listening on ${config.hostname}:${config.port}`)
  }

  const stop = async () => {
    if (!socket) return
    uws.us_listen_socket_close(socket)
    socket = undefined
  }

  return { start, stop }
}

/**
 * @param {Req} req
 * @param {Res} res
 */
const createBody = (req, res) => {
  /** @returns {Promise<Buffer>} */
  const toBuffer = () => {
    const chunks = []
    return new Promise((resolve, reject) => {
      res.onData((chunk, isLast) => {
        chunks.push(Buffer.from(chunk))
        if (isLast) resolve(Buffer.concat(chunks))
      })
      res.onAborted(() => reject(new Error('Aborted')))
    })
  }

  /** @returns {Promise<string>} */
  const toJSON = async () => {
    const buffer = await toBuffer()
    return buffer.toString()
  }

  /** @returns {import('node:stream').Readable} */
  const toStream = () => {
    const stream = new PassThrough()
    res.onData((chunk, isLast) => {
      stream.write(Buffer.from(chunk))
      if (isLast) stream.end()
    })
    res.onAborted(() => stream.destroy())
    return stream
  }

  return { toBuffer, toJSON, toStream }
}

/**
 * @param {Res} res
 */
const setDefaultHeaders = (res) => {
  for (const [key, value] of Object.entries(HEADERS))
    res.writeHeader(key, value)
}

/**
 * @param {Req} req
 */
const getRequestUrl = (req) => {
  return new URL(req.getUrl(), 'http://' + (req.getHeader('host') || 'unknown'))
}

/**
 * @param {Req} req
 */
const getRequestHeaders = (req) => {
  const headers = {}
  req.forEach((key, value) => (headers[key] = value))
  return headers
}

/**
 * @param {uws.WebSocket} ws
 * @param {number} id
 * @param {import('@neemata/common').StreamMeta} meta
 * */
const createStream = (ws, id, meta) => {
  const stream = new PassThrough()
  let paused = stream.isPaused()
  let bytesReceived = 0

  const pull = () => {
    ws.send(
      concat(
        encodeNumber(MessageType.STREAM_PULL, Uint8Array),
        encodeNumber(id, Uint32Array),
        encodeBigNumber(bytesReceived, BigUint64Array)
      ),
      true
    )
    return new Promise((resolve) =>
      stream.once('received', (byteLength) => {
        bytesReceived += byteLength
        resolve(undefined)
      })
    )
  }

  const setPause = () => stream.isPaused()

  stream.on('pause', setPause)
  stream.on('resume', setPause)

  const needPulling = async () => {
    if (!paused) return true
    if (stream.writableFinished) return false
    return new Promise((r) => stream.once('resume', r))
  }

  stream.once('resume', async () => {
    while (await needPulling()) {
      await pull()
    }
  })

  return Object.assign(stream, { meta })
}
