import {
  ApiError,
  ErrorCode,
  MessageType,
  STREAM_ID_PREFIX,
  Scope,
  StreamsPayloadView,
  Transport,
  concat,
  decodeText,
  encodeBigNumber,
  encodeNumber,
  encodeText,
} from '@neemata/common'
import { randomUUID } from 'node:crypto'
import EventEmitter from 'node:events'
import { PassThrough, Readable } from 'node:stream'
import qs from 'qs'
import uws from 'uWebSockets.js'
import { logger } from './logger.js'
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
 */
export const createServer = (config, api) => {
  /** @type {uws.us_listen_socket | undefined} */
  let socket

  /** @type {import('./container').Container} */
  let container

  const basePath = (...parts) => [config.basePath, ...parts].join('/')
  const server = config.https ? uws.SSLApp(config.https) : uws.App()

  const websockets = new Map()
  const rooms = new Map()

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

  const throttle = async (cb, name) => {
    if (!semaphore) return cb()
    try {
      logger.trace('Trying to enter rpc queue for [%s] procedure...', name)
      await semaphore.enter()
      logger.trace('Entered rpc queue for [%s] procedure', name)
      return await cb()
    } catch (error) {
      if (error instanceof SemaphoreError)
        throw new ApiError(ErrorCode.ServiceUnavailable, 'Server is too busy')
      else throw error
    } finally {
      logger.trace('Leaving rpc queue for [%s] procedure...', name)
      await semaphore.leave()
    }
  }

  /**
   * @param {string} name
   * @param {import('./container.js').Container} container
   * @param {any} payload
   */
  const handleRPC = async (name, container, payload, params = {}) => {
    logger.debug('Handling [%s] procedure...', name)
    try {
      return await throttle(async () => {
        logger.trace('Resolving [%s] procedure...', name)
        const { handle, input, output } = await api.get(container, name)

        logger.trace("Handling [%s] procedure's input...", name)
        const data = input ? await input(payload) : payload

        logger.trace("Firing [%s] procedure's handler...", name)
        const response = await handle(data, params)

        logger.trace("Handling [%s] procedure's output...", name)
        return output ? await output(response) : response
      }, name)
    } catch (error) {
      throw api.handleError(error)
    }
  }

  /**
   * @param {Req} req
   * @param {Res} res
   * @param {string} method
   * @param {any} query
   */
  const bodyHandler = async (req, res, method, query) => {
    if (method === 'post') {
      if (!req.getHeader('content-type').startsWith(JSON_CONTENT_TYPE_MIME))
        throw new ApiError(ErrorCode.NotAcceptable, 'Unsupported body type')
      return deserialize(await createBody(req, res).toJSON())
    } else {
      return query
    }
  }

  const httpResponseHandler = (req, res, headers, data) => {
    setDefaultHeaders(res)
    setCors(res, headers)
    res.end(serialize(data))
  }

  /**
   * @param {Req} req
   * @param {Res} res
   * @param {any} headers
   * @param {Readable} stream
   */
  const httpStreamResponseHandler = (req, res, headers, stream) => {
    let isAborted = false
    const tryRespond = (cb) => {
      if (!isAborted) res.cork(cb)
    }
    stream.on('error', () => tryRespond(() => res.close()))
    res.onAborted(() => {
      isAborted = true
      stream.destroy(new Error('Aborted by client'))
    })
    stream.on('end', () => tryRespond(() => res.end()))
    stream.on('data', (chunk) => {
      const arrayBuffer = chunk.buffer.slice(
        chunk.byteOffset,
        chunk.byteOffset + chunk.byteLength
      )
      let ok = false
      tryRespond(() => (ok = res.write(arrayBuffer)))
      const lastOffset = res.getWriteOffset()
      if (!ok) {
        stream.pause()
        res.onWritable((offset) => {
          let ok = false
          tryRespond(
            () => (ok = res.write(arrayBuffer.slice(offset - lastOffset)))
          )
          if (ok) stream.resume()
          return ok
        })
      }
    })
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
    const url = getRequestUrl(req)
    const query = qs.parse(req.getQuery(), config.qsOptions)
    const headers = getRequestHeaders(req)
    const proxyRemoteAddress = decodeText(res.getProxiedRemoteAddressAsText())
    const remoteAddress = decodeText(res.getRemoteAddressAsText())

    try {
      const procedure = url.pathname.substring(basePath('api').length + 1)
      const body = await bodyHandler(req, res, method, query)

      let params = {
        headers,
        query,
        proxyRemoteAddress,
        remoteAddress,
      }
      const connectionContainer = await container
        .copy(Scope.Connection, params)
        .load()

      params = {
        ...params,
        procedure,
        transport: Transport.Http,
        method,
      }

      const callContainer = await connectionContainer
        .copy(Scope.Call, params)
        .load()

      const responseHeaders = new Map()
      const setResponseHeader = (name, value) =>
        responseHeaders.set(name, value)
      const response = await handleRPC(procedure, callContainer, body, {
        setHeader: setResponseHeader,
      })
      const responseHandler =
        response instanceof Readable
          ? httpStreamResponseHandler
          : httpResponseHandler

      tryRespond(() => {
        for (const [name, value] of responseHeaders)
          res.writeHeader(name, value)
        responseHandler(
          req,
          res,
          headers,
          response instanceof Readable ? response : { response }
        )
      })

      await connectionContainer.dispose()
      await callContainer.dispose()
    } catch (error) {
      tryRespond(() => {
        if (error instanceof ApiError) {
          httpResponseHandler(req, res, headers, { error })
        } else {
          logger.error(new Error('Unexpected error', { cause: error }))
          res.writeStatus('500 Internal Server Error')
          httpResponseHandler(req, res, headers, { error: InternalError })
        }
      })
    }
  }

  server.post(basePath('api', '*'), handleHTTP)
  server.get(basePath('api', '*'), handleHTTP)
  server.get(basePath('health'), (res, req) => {
    if (!socket) return void res.close()
    const headers = getRequestHeaders(req)
    setDefaultHeaders(res)
    setCors(res, headers)
    res.end('OK')
  })
  server.options(basePath('*'), (res, req) => {
    if (!socket) return void res.close()
    const headers = getRequestHeaders(req)
    setDefaultHeaders(res)
    setCors(res, headers)
    if (req.getUrl().startsWith(basePath('api')))
      res.writeHeader('Accept', JSON_CONTENT_TYPE_MIME)
    res.writeStatus('204 No Content')
    res.endWithoutBody()
  })
  server.any('/*', (res, req) => {
    if (!socket) return void res.close()
    const headers = getRequestHeaders(req)
    setDefaultHeaders(res)
    setCors(res, headers)
    res.writeStatus('404 Not Found')
    res.end('Not Found')
  })

  /**
   * @param {uws.WebSocket} ws
   * @param {Buffer} payloadBuf
   */
  const handleWSRPC = async (ws, payloadBuf) => {
    //TODO: refactor this mess

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

    const streamsReplacer = (key, value) => {
      if (typeof value === 'string' && value.startsWith(STREAM_ID_PREFIX)) {
        return streams.get(value.slice(STREAM_ID_PREFIX.length))
      }
      return value
    }

    const rpcPayload = deserialize(
      payloadBuf.subarray(Uint32Array.BYTES_PER_ELEMENT + streamsPayloadLength),
      streamsReplacer
    )

    const type = encodeNumber(MessageType.Rpc, Uint8Array)

    let { id, container, params, events } = ws.getUserData()
    const { procedure, payload, callId } = rpcPayload

    const wsInterface = {
      send: (event, data) => ws.send(createWsEvent(event, data)),
      rooms: () => new Set(ws.getTopics()),
      join: (roomName) => ws.subscribe(roomName),
      leave: (roomName) => ws.unsubscribe(roomName),
      publish: (roomName, event, data, includeSelf = false) => {
        const room = rooms.get(roomName)
        if (room) {
          for (const ws of room) {
            if (ws.id !== id || includeSelf) {
              ws.send(createWsEvent(event, data), true)
            }
          }
        }
        return !!room
      },
    }

    params = {
      ...params,
      transport: Transport.Http,
      procedure,
      websocket: wsInterface,
    }
    const scopeContainer = container.copy(Scope.Call, params)

    try {
      await scopeContainer.load()
      const response = await handleRPC(procedure, scopeContainer, payload)
      ws.send(
        concat(type, encodeText(serialize({ callId, payload: { response } }))),
        true
      )
    } catch (error) {
      if (error instanceof ApiError) {
        ws.send(
          concat(type, encodeText(serialize({ callId, payload: { error } }))),
          true
        )
      } else {
        logger.error(new Error('Unexpected error', { cause: error }))
        ws.send(
          concat(
            type,
            encodeText(serialize({ callId, payload: { error: InternalError } }))
          ),
          true
        )
      }
    } finally {
      await scopeContainer.dispose()
    }
  }

  server.ws(basePath('api'), {
    maxPayloadLength: 16 * 1024 * 1024,
    sendPingsAutomatically: true,
    upgrade: async (res, req, socket) => {
      if (!socket) return void res.close()
      let isAborted = false
      res.onAborted(() => (isAborted = true))

      const headers = getRequestHeaders(req)
      const proxyRemoteAddress = decodeText(res.getProxiedRemoteAddressAsText())
      const remoteAddress = decodeText(res.getRemoteAddressAsText())
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
            {
              id: randomUUID(),
              streams,
              container: scopeContainer,
              params,
              events,
            },
            secKey,
            secProtocol,
            secExtensions,
            socket
          )
        })
      } catch (error) {
        res.close()
        // Dispone the container if the connection is aborted before upgrading to ws
        if (error.message === 'Aborted') await scopeContainer.dispose()
      }
    },
    open: (ws) => {
      const { id, events } = ws.getUserData()
      logger.trace('Open new websocket [%s]', id)

      websockets.set(id, ws)
      events.on(MessageType.Rpc, handleWSRPC)
      events.on(MessageType.StreamPush, (ws, buffer) => {
        const { streams } = ws.getUserData()
        const id = buffer.readUint32LE()
        const stream = streams.get(id.toString())
        if (!stream) ws.close()
        const chunk = buffer.subarray(Uint32Array.BYTES_PER_ELEMENT)
        stream.push(chunk)
        stream.emit('received', chunk.byteLength)
      })
      events.on(MessageType.StreamEnd, (ws, buffer) => {
        const { streams } = ws.getUserData()
        const id = buffer.readUint32LE().toString()
        const stream = streams.get(id)
        if (!stream) return void ws.close()
        stream.end()
        streams.delete(id)
      })
      events.on(MessageType.StreamTerminate, (ws, buffer) => {
        const { streams } = ws.getUserData()
        const id = buffer.readUint32LE().toString()
        const stream = streams.get(id)
        if (!stream) ws.close()
        stream.destroy(new Error('Termiated by client'))
        streams.delete(id)
      })
      events.on(MessageType.Event, (event, data) => {
        ws.send(createWsEvent(event, data), true)
      })
    },
    message: (ws, message, isBinary) => {
      if (!isBinary) return void ws.close()
      const { id, events } = ws.getUserData()
      logger.trace('Receive websocket [%s] message', id)
      try {
        const buf = Buffer.from(message)
        const type = buf.subarray(0, Uint8Array.BYTES_PER_ELEMENT).readUint8()
        const buffer = buf.subarray(Uint8Array.BYTES_PER_ELEMENT)
        events.emit(type, ws, buffer)
      } catch (error) {
        logger.error(error)
      }
    },
    subscription: (ws, roomNameBuff, newCount, oldCount) => {
      const { id } = ws.getUserData()
      const roomName = decodeText(roomNameBuff)
      const unsubscribed = newCount < oldCount

      logger.debug(
        '%s websocket [%s] %s room [%s]',
        unsubscribed ? 'Unsubscribe' : 'Subscribe',
        id,
        unsubscribed ? 'from' : 'to',
        roomName
      )

      const room = rooms.get(roomName) ?? new Set()
      if (newCount === 0) {
        room.clear()
        rooms.delete(roomName)
      } else {
        if (unsubscribed) room.delete(ws)
        else room.add(ws)

        if (!rooms.has(roomName)) rooms.set(roomName, room)
      }
    },
    close: async (ws, code, message) => {
      const { id, container, streams, events } = ws.getUserData()
      logger.trace('Close websocket [%s]', id)
      websockets.delete(id)
      events.removeAllListeners()
      for (const stream of streams.values()) stream.destroy()
      streams.clear()
      await container.dispose()
    },
  })

  const start = async () => {
    const { hostname, port, basePath } = config
    socket = await new Promise((r) => {
      if (hostname.startsWith('unix:')) {
        server.listen_unix(r, hostname.slice(5))
      } else if (typeof port !== 'string') {
        server.listen(hostname, port, r)
      }
    })
    logger.info(
      'Listening on %s://%s:%s%s',
      config.https ? 'https' : 'http',
      hostname,
      port,
      basePath
    )
  }

  const stop = async () => {
    if (!socket) return
    uws.us_listen_socket_close(socket)
    socket = undefined
  }

  const setGlobalContainer = (globalContainer) => (container = globalContainer)

  return { start, stop, setGlobalContainer, websockets, rooms }
}

const serialize = (data, receiver) => JSON.stringify(data, receiver)
const deserialize = (data, receiver) => JSON.parse(data, receiver)

const createWsEvent = (event, data) => {
  const type = encodeNumber(MessageType.Event, Uint8Array)
  const payload = encodeText(serialize({ event, data }))
  return concat(type, payload)
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
        encodeNumber(MessageType.StreamPull, Uint8Array),
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
