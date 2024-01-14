import { beforeEach, describe, expect, it } from 'vitest'

import { BaseParser, Procedure } from '@/api'
import { Provider } from '@/container'

class Parser extends BaseParser {
  parse() {}
}

describe.sequential('Procedure', () => {
  let procedure: Procedure

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
    const parser = new Parser()
    const newProcedure = procedure.withInputParser(parser)
    expect(newProcedure.parsers?.input).toBe(parser)
    expect(newProcedure).not.toBe(procedure)
  })

  it('should clone with an output parser', () => {
    const parser = new Parser()
    const newProcedure = procedure.withOutputParser(parser)
    expect(newProcedure.parsers?.output).toBe(parser)
    expect(newProcedure).not.toBe(procedure)
  })

  it('should clone with parser', () => {
    const inputParser = new Parser()
    const parser = new Parser()
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
})
