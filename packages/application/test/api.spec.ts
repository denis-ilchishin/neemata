import {
  TestParser,
  TestTransport,
  defaultTimeout,
  testApp,
  testConnection,
  testTransport,
} from './_utils'

import { Api, Procedure, ProcedureCallOptions } from '@/api'
import { Application } from '@/application'
import { Provider } from '@/container'
import { EventManager } from '@/events'
import { Scope } from '@/types'
import { ApiError, ErrorCode } from '@neematajs/common'

describe.sequential('Procedure', () => {
  let procedure: Procedure<Application<{ test: TestTransport }>>

  beforeEach(() => {
    procedure = new Procedure()
  })

  it('should be a procedure', () => {
    expect(procedure).toBeDefined()
    expect(procedure).toBeInstanceOf(Procedure)
  })

  it('should clone with a description', () => {
    const newProcedure = procedure.withDescription('description')
    expect(newProcedure.description).toBe('description')
    expect(newProcedure).not.toBe(procedure)
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
    const guard1 = new Provider().withValue(() => false)
    const guard2 = new Provider().withValue(() => true)

    const newProcedure = procedure.withGuards(guard1)
    const newProcedure2 = newProcedure.withGuards(guard2)

    expect(newProcedure2.guards).toEqual([guard1, guard2])
    expect(newProcedure2).not.toBe(procedure)
  })

  it('should clone with middlewares', () => {
    const middleware1 = new Provider().withValue(() => {})
    const middleware2 = new Provider().withValue(() => {})

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

  it('should clone with a tags', () => {
    const newProcedure = procedure.withTags('tag1')
    const newProcedure2 = newProcedure.withTags('tag2')
    expect(newProcedure.tags).toEqual(['tag1'])
    expect(newProcedure2.tags).toEqual(['tag1', 'tag2'])
    expect(newProcedure2).not.toBe(procedure)
  })

  it('should clone with a timeout', () => {
    const newProcedure = procedure.withTimeout(1000)
    expect(newProcedure.timeout).toEqual(1000)
    expect(newProcedure).not.toBe(procedure)
  })

  it('should fail clone with a timeout', () => {
    expect(() => procedure.withTimeout(-1000)).toThrow()
  })

  it('should clone with a middlewareEnabled', () => {
    const newProcedure = procedure.withMiddlewareEnabled(false)
    expect(newProcedure.middlewareEnabled).toEqual(false)
    expect(newProcedure).not.toBe(procedure)
  })

  it('should clone with a transports', () => {
    const newProcedure = procedure.withTransports({
      test: true,
    })
    expect(newProcedure.transports).toEqual({ test: true })
    expect(newProcedure).not.toBe(procedure)
  })
})

describe.sequential('Api', () => {
  let app: ReturnType<typeof createApp>
  let api: ReturnType<typeof createApp>['api']

  const call = (
    options: Pick<ProcedureCallOptions, 'procedure'> &
      Partial<ProcedureCallOptions>,
  ) =>
    api.call({
      transport: app.transports.test,
      connection: testConnection({}),
      container: app.container,
      payload: {},
      path: [options.procedure],
      ...options,
    })

  const createApp = () =>
    testApp().registerTransports({ test: testTransport() })

  const testProcedure = () =>
    app.procedure().withName('test').withTransports({ test: true })

  beforeEach(async () => {
    app = createApp()
    await app.initialize()
    api = app.api
  })

  it('should be an api', () => {
    expect(api).toBeDefined()
    expect(api).toBeInstanceOf(Api)
  })

  it('should be initiate with options', () => {
    let newApi = new Api(testApp(), {
      timeout: defaultTimeout,
      parsers: new TestParser(),
    })
    expect(newApi.parsers.input).toBeInstanceOf(TestParser)
    expect(newApi.parsers.output).toBeInstanceOf(TestParser)
    const inputParser = new TestParser()
    const outputParser = new TestParser()
    newApi = new Api(app, {
      timeout: defaultTimeout,
      parsers: {
        input: inputParser,
        output: outputParser,
      },
    })
    expect(newApi.parsers.input).toBe(inputParser)
    expect(newApi.parsers.output).toBe(outputParser)
  })

  it('should handle procedure call', async () => {
    const procedure = testProcedure().withHandler(() => 'result')
    await expect(call({ procedure })).resolves.toBe('result')
  })

  it('should inject context', async () => {
    const procedure = testProcedure().withHandler((ctx) => ctx)
    const connection = testConnection({})
    const ctx = await call({
      connection,
      procedure,
    })
    expect(ctx).toHaveProperty('context')
    expect(ctx.context).toHaveProperty('connection', connection)
    expect(ctx.context).toHaveProperty('call', expect.any(Function))
    expect(ctx.context).toHaveProperty('logger')
    expect(ctx.context).toHaveProperty('eventManager', expect.any(EventManager))
    expect(ctx.context).toHaveProperty('execute', expect.any(Function))
  })

  it('should inject dependencies', async () => {
    const provider = new Provider().withValue('value')
    const procedure = testProcedure()
      .withDependencies({ provider })
      .withHandler(({ provider }) => provider)
    await expect(call({ procedure })).resolves.toBe('value')
  })

  it('should inject connection', async () => {
    const provider = new Provider()
      .withScope(Scope.Connection)
      .withFactory(({ context: { connection } }) => connection)
    const procedure = testProcedure()
      .withDependencies({ provider })
      .withHandler(({ provider }) => provider)
    const connection = testConnection({})
    await expect(call({ connection, procedure })).resolves.toBe(connection)
  })

  it('should handle procedure call with payload', async () => {
    const payload = {}
    const procedure = testProcedure().withHandler((ctx, data) => data)
    await expect(call({ procedure, payload })).resolves.toBe(payload)
  })

  it('should handle procedure handler error', async () => {
    const procedure = testProcedure().withHandler(() => {
      throw new Error()
    })
    const result = await call({ procedure }).catch((v) => v)
    expect(result).toBeInstanceOf(Error)
  })

  it('should handle filter', async () => {
    class CustomError extends Error {}
    const filter = new Provider().withValue(() => new ApiError('custom'))
    const spy = vi.spyOn(filter, 'value')
    app.registry.registerFilter(CustomError, filter)
    const error = new CustomError()
    const procedure = testProcedure().withHandler(() => {
      throw error
    })
    const result = await call({ procedure }).catch((v) => v)
    expect(result).toBeInstanceOf(ApiError)
    expect(spy).toHaveBeenCalledOnce()
    expect(spy).toHaveBeenCalledWith(error)
  })

  it('should handle guard', async () => {
    const guard = new Provider().withValue(() => false)
    const procedure = testProcedure()
      .withGuards(guard)
      .withHandler(() => 'result')
    const result = await call({ procedure }).catch((v) => v)
    expect(result).toBeInstanceOf(ApiError)
    expect(result).toHaveProperty('code', ErrorCode.Forbidden)
  })

  it('should handle middleware', async () => {
    const middleware = new Provider().withValue(
      async (ctx, next) => (await next()) + 'middleware',
    )
    const spy = vi.spyOn(middleware, 'value')
    const procedure = testProcedure()
      .withMiddlewares(middleware)
      .withHandler(() => 'result')
    const res = await call({ procedure })
    expect(spy).toHaveBeenCalledOnce()
    expect(res).toBe('resultmiddleware')
  })

  it('should handle timeout', async () => {
    const procedure = testProcedure()
      .withTimeout(10)
      .withHandler(() => new Promise((resolve) => setTimeout(resolve, 100)))
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

    await expect(call({ procedure }).catch((v) => v)).resolves.toBeInstanceOf(
      ApiError,
    )
  })

  it('should find procedure', async () => {
    const procedure = testProcedure().withHandler(() => 'result')
    app.registry.procedures.set(procedure.name, { module: procedure })
    expect(api.find(procedure.name)).toBe(procedure)
  })

  it('should fail find procedure', async () => {
    expect(() => api.find('non-existing')).toThrow()
  })

  it('should handle nested call', async () => {
    const handler = vi.fn(() => 'result')
    const procedure = testProcedure().withHandler(handler)
    const procedure2 = testProcedure().withHandler(({ context: { call } }) =>
      call(procedure),
    )
    const res = await call({ procedure: procedure2 })
    expect(handler).toHaveBeenCalledOnce()
    expect(res).toBe('result')
  })
})
