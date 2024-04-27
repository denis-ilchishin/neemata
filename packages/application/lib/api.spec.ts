import {
  type TestConnection,
  TestParser,
  TestTransport,
  testApp,
  testConnection,
  testDefaultTimeout,
  testLogger,
  testProcedure,
} from '@test/_utils'

import { ApiError, ErrorCode } from '@neematajs/common'
import { Api, Procedure, type ProcedureCallOptions } from './api'
import type { AnyProcedure, FilterFn, GuardFn, MiddlewareFn } from './common'
import {
  CALL_PROVIDER,
  CONNECTION_PROVIDER,
  Container,
  Provider,
} from './container'
import { Registry } from './registry'
import { noop } from './utils/functions'

describe.sequential('Procedure', () => {
  let procedure: AnyProcedure

  beforeEach(() => {
    procedure = testProcedure()
  })

  it('should be a procedure', () => {
    expect(procedure).toBeDefined()
    expect(procedure).toBeInstanceOf(Procedure)
  })

  it('should clone with a dependencies', () => {
    const dep1 = new Provider().withValue('dep1')
    const dep2 = new Provider().withValue('dep2')

    const newProcedure = procedure.withDependencies({
      dep1,
    })

    const newProcedure2 = newProcedure.withDependencies({
      dep2,
    })

    expect(newProcedure2.dependencies).toHaveProperty('dep1', dep1)
    expect(newProcedure2.dependencies).toHaveProperty('dep2', dep2)
    expect(newProcedure2).not.toBe(procedure)
  })

  it('should clone with a options', () => {
    let newProcedure = procedure.withOptions({ some: 'option' })
    expect(newProcedure.options).to.deep.eq({ some: 'option' })
    expect(newProcedure).not.toBe(procedure)
    newProcedure = procedure.withOptions({ some: 'option', other: 'option' })
    expect(newProcedure.options).to.deep.eq({ some: 'option', other: 'option' })
    expect(newProcedure).not.toBe(procedure)
    newProcedure = procedure.withOptions({ some: 'another', other: 'option' })
    expect(newProcedure.options).to.deep.eq({
      some: 'another',
      other: 'option',
    })
  })

  it('should clone with guards', () => {
    const guard1 = new Provider().withValue((() => false) as GuardFn)
    const guard2 = new Provider().withValue((() => true) as GuardFn)

    const newProcedure = procedure.withGuards(guard1)
    const newProcedure2 = newProcedure.withGuards(guard2)

    expect(newProcedure2.guards).toEqual([guard1, guard2])
    expect(newProcedure2).not.toBe(procedure)
  })

  it('should clone with middlewares', () => {
    const middleware1 = new Provider().withValue((() => void 0) as MiddlewareFn)
    const middleware2 = new Provider().withValue((() => void 0) as MiddlewareFn)

    const newProcedure = procedure.withMiddlewares(middleware1)
    const newProcedure2 = newProcedure.withMiddlewares(middleware2)

    expect(newProcedure2.middlewares).toEqual([middleware1, middleware2])
    expect(newProcedure2).not.toBe(procedure)
  })

  it('should clone with a handler', () => {
    const handler = () => {}
    const newProcedure = procedure.withHandler(handler)
    expect(newProcedure.handler).toBe(handler)
    expect(newProcedure).not.toBe(procedure)
  })

  it('should clone with a input', () => {
    const input = {}
    const newProcedure = procedure.withInput(input)
    expect(newProcedure.input).toBe(input)
    expect(newProcedure).not.toBe(procedure)
  })

  it('should clone with a output', () => {
    const output = {}
    const newProcedure = procedure.withOutput(output)
    expect(newProcedure.output).toBe(output)
    expect(newProcedure).not.toBe(procedure)
  })

  it('should clone with an input parser', () => {
    const parser = new TestParser()
    const newProcedure = procedure.withInputParser(parser)
    expect(newProcedure.parsers?.input).toBe(parser)
    expect(newProcedure).not.toBe(procedure)
  })

  it('should clone with an output parser', () => {
    const parser = new TestParser()
    const newProcedure = procedure.withOutputParser(parser)
    expect(newProcedure.parsers?.output).toBe(parser)
    expect(newProcedure).not.toBe(procedure)
  })

  it('should clone with parser', () => {
    const inputParser = new TestParser()
    const parser = new TestParser()
    const newProcedure = procedure
      .withInputParser(inputParser)
      .withParser(parser)
    expect(newProcedure.parsers?.input).not.toBe(inputParser)
    expect(newProcedure.parsers?.output).toBe(parser)
  })

  it('should clone with a timeout', () => {
    const newProcedure = procedure.withTimeout(1000)
    expect(newProcedure.timeout).toEqual(1000)
    expect(newProcedure).not.toBe(procedure)
  })

  it('should fail clone with a timeout', () => {
    expect(() => procedure.withTimeout(-1000)).toThrow()
  })

  it('should clone with a transports', () => {
    const newProcedure = procedure.withTransport(TestTransport)
    expect(newProcedure.transports.has(TestTransport)).toEqual(true)
    expect(newProcedure).not.toBe(procedure)
  })
})

describe.sequential('Api', () => {
  const inputParser = new TestParser()
  const outputParser = new TestParser()
  const logger = testLogger()

  let registry: Registry
  let container: Container
  let transport: TestTransport
  let connection: TestConnection<any>
  let api: Api

  const call = (
    options: Pick<ProcedureCallOptions, 'procedure'> &
      Partial<Omit<ProcedureCallOptions, 'procedure'>>,
  ) =>
    api.call({
      container,
      transport,
      connection,
      payload: {},
      path: [options.procedure],
      ...options,
    })

  const testProcedure = () => new Procedure().withTransport(TestTransport)

  beforeEach(async () => {
    registry = new Registry({ logger, modules: {} })
    container = new Container({ registry, logger })
    transport = new TestTransport()
    connection = testConnection(registry, {})
    api = new Api(
      {
        container,
        registry,
        logger,
        transports: new Set([transport]),
      },
      {
        timeout: testDefaultTimeout,
        parsers: {
          input: inputParser,
          output: outputParser,
        },
      },
    )
  })

  it('should be an api', () => {
    expect(api).toBeDefined()
    expect(api).toBeInstanceOf(Api)
  })

  it('should be initiate correctly', () => {
    const parser = new TestParser()
    const api1 = new Api(testApp(), {
      timeout: testDefaultTimeout,
      parsers: parser,
    })
    expect(api1.parsers.input).toBe(parser)
    expect(api1.parsers.output).toBe(parser)

    const inputParser = new TestParser()
    const outputParser = new TestParser()
    const api2 = new Api(testApp(), {
      timeout: testDefaultTimeout,
      parsers: {
        input: inputParser,
        output: outputParser,
      },
    })
    expect(api2.parsers.input).toBe(inputParser)
    expect(api2.parsers.output).toBe(outputParser)
  })

  it('should inject context', async () => {
    const spy = vi.fn()
    const procedure = testProcedure()
      .withDependencies({
        connection: CONNECTION_PROVIDER,
        call: CALL_PROVIDER,
      })
      .withHandler(spy)
    registry.registerProcedure('test', 'test', procedure)
    const connection = testConnection(registry, {})
    await call({
      connection,
      procedure,
    })
    expect(spy).toHaveBeenCalledWith(
      {
        connection,
        call: expect.any(Function),
      },
      expect.anything(),
    )
  })

  it('should handle procedure call', async () => {
    const procedure = testProcedure().withHandler(() => 'result')
    registry.registerProcedure('test', 'test', procedure)
    await expect(call({ procedure })).resolves.toBe('result')
  })

  it('should inject dependencies', async () => {
    const provider = new Provider().withValue('value')
    const procedure = testProcedure()
      .withDependencies({ provider })
      .withHandler(({ provider }) => provider)
    registry.registerProcedure('test', 'test', procedure)
    await expect(call({ procedure })).resolves.toBe('value')
  })

  it('should inject connection', async () => {
    const provider = new Provider()
      .withDependencies({ connection: CONNECTION_PROVIDER })
      .withFactory(({ connection }) => connection)
    const procedure = testProcedure()
      .withDependencies({ provider })
      .withHandler(({ provider }) => provider)
    registry.registerProcedure('test', 'test', procedure)
    const connection = testConnection(registry, {})
    await expect(call({ connection, procedure })).resolves.toBe(connection)
  })

  it('should handle procedure call with payload', async () => {
    const payload = {}
    const procedure = testProcedure().withHandler((ctx, data) => data)
    registry.registerProcedure('test', 'test', procedure)
    await expect(call({ procedure, payload })).resolves.toBe(payload)
  })

  it('should handle procedure handler error', async () => {
    const procedure = testProcedure().withHandler(() => {
      throw new Error()
    })
    registry.registerProcedure('test', 'test', procedure)
    const result = await call({ procedure }).catch((v) => v)
    expect(result).toBeInstanceOf(Error)
  })

  it('should handle filter', async () => {
    class CustomError extends Error {}
    const filter = new Provider().withValue(
      (() => new ApiError('custom')) as FilterFn,
    )
    const spy = vi.spyOn(filter, 'value')
    registry.registerFilter(CustomError, filter)
    const error = new CustomError()
    const procedure = testProcedure().withHandler(() => {
      throw error
    })
    registry.registerProcedure('test', 'test', procedure)
    await expect(call({ procedure })).rejects.toBeInstanceOf(ApiError)
    expect(spy).toHaveBeenCalledOnce()
    expect(spy).toHaveBeenCalledWith(error)
  })

  it('should handle guard', async () => {
    const guard = new Provider().withValue((() => false) as GuardFn)
    const procedure = testProcedure()
      .withGuards(guard)
      .withHandler(() => 'result')
    registry.registerProcedure('test', 'test', procedure)
    const result = await call({ procedure }).catch((v) => v)
    expect(result).toBeInstanceOf(ApiError)
    expect(result).toHaveProperty('code', ErrorCode.Forbidden)
  })

  it('should handle middleware', async () => {
    const middleware1Fn = vi.fn(
      async (ctx, next, payload) =>
        (await next([...payload, 2])) + '_middleware',
    )
    const middleware2Fn = vi.fn(
      async (ctx, next, payload) =>
        (await next([...payload, 3])) + '_middleware',
    )

    const handlerFn = vi.fn(() => 'result')

    const middleware1 = new Provider().withValue(middleware1Fn as MiddlewareFn)
    const middleware2 = new Provider().withValue(middleware2Fn as MiddlewareFn)
    const procedure = testProcedure()
      .withMiddlewares(middleware1, middleware2)
      .withHandler(handlerFn)

    registry.registerProcedure('test', 'test', procedure)

    const response = await call({ procedure, payload: [1] })

    expect(middleware1Fn).toHaveBeenCalledWith(
      {
        names: ['test/test'],
        connection,
        path: [procedure],
        procedure,
        container,
      },
      expect.any(Function),
      [1],
    )
    expect(middleware2Fn).toHaveBeenCalledWith(
      {
        names: ['test/test'],
        connection,
        path: [procedure],
        procedure,
        container,
      },
      expect.any(Function),
      [1, 2],
    )
    expect(handlerFn).toHaveBeenCalledWith(expect.anything(), [1, 2, 3])
    expect(response).toBe('result_middleware_middleware')
  })

  it('should handle timeout', async () => {
    const procedure = testProcedure()
      .withTimeout(10)
      .withHandler(() => new Promise((resolve) => setTimeout(resolve, 100)))
    registry.registerProcedure('test', 'test', procedure)
    const res = await call({ procedure }).catch((v) => v)
    expect(res).toBeInstanceOf(ApiError)
    expect(res).toHaveProperty('code', ErrorCode.RequestTimeout)
  })

  it('should handle input parser', async () => {
    const payload = {}
    const schema = {}
    const parser = { custom: (schema, val) => ({ schema, val }) }
    const spy = vi.spyOn(parser, 'custom')
    const procedure = testProcedure()
      .withInputParser(new TestParser(parser.custom))
      .withInput(schema)
      .withHandler((ctx, val) => val)
    registry.registerProcedure('test', 'test', procedure)
    const res = await call({ procedure, payload })
    expect(res).toHaveProperty('schema', schema)
    expect(res).toHaveProperty('val', payload)
    expect(spy).toHaveBeenCalledOnce()
  })

  it('should handle output parser', async () => {
    const payload = {}
    const schema = {}
    const custom = vi.fn((schema, val) => ({ schema, val }))
    const procedure = testProcedure()
      .withOutputParser(new TestParser(custom))
      .withOutput(schema)
      .withHandler((ctx, val) => val)
    registry.registerProcedure('test', 'test', procedure)
    const res = await call({ procedure, payload })
    expect(custom).toHaveBeenCalledOnce()
    expect(res).toHaveProperty('schema', schema)
    expect(res).toHaveProperty('val', payload)
  })

  it('should handle output parser error', async () => {
    const procedure = testProcedure()
      .withOutputParser(
        new TestParser((schema, val) => {
          throw new Error('error')
        }),
      )
      .withOutput({})
      .withHandler((ctx, val) => val)
    registry.registerProcedure('test', 'test', procedure)
    await expect(call({ procedure })).rejects.toBeInstanceOf(ApiError)
  })

  it('should find procedure', async () => {
    const procedure = testProcedure().withHandler(() => 'result')
    registry.registerProcedure('test', 'test', procedure)
    expect(api.find('test/test')).toBe(procedure)
  })
})
