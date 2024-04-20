import { testEvent, testProcedure, testTask } from '@test/_utils'
import { Module } from './module'
import { noop } from './utils/functions'

describe('Module', () => {
  let module: Module

  beforeEach(() => {
    module = new Module()
  })

  it('should be a module', () => {
    expect(module).toBeDefined()
    expect(module).toBeInstanceOf(Module)
  })

  it('should have procedures', () => {
    const testProcedure1 = testProcedure()
    const testProcedure2 = testProcedure()
    module = module.withProcedures({ test1: testProcedure1 })
    expect(module.procedures).toHaveProperty('test1', testProcedure1)
    module = module.withProcedures({ test2: testProcedure2 })
    expect(module.procedures).toHaveProperty('test1', testProcedure1)
    expect(module.procedures).toHaveProperty('test2', testProcedure2)
  })

  it('should have tasks', () => {
    const testTask1 = testTask()
    const testTask2 = testTask()
    module = module.withTasks({ test1: testTask1 })
    expect(module.tasks).toHaveProperty('test1', testTask1)
    module = module.withTasks({ test2: testTask2 })
    expect(module.tasks).toHaveProperty('test1', testTask1)
    expect(module.tasks).toHaveProperty('test2', testTask2)
  })

  it('should have events', () => {
    const testEvent1 = testEvent()
    const testEvent2 = testEvent()
    module = module.withEvents({ test1: testEvent1 })
    expect(module.events).toHaveProperty('test1', testEvent1)
    module = module.withEvents({ test2: testEvent2 })
    expect(module.events).toHaveProperty('test1', testEvent1)
    expect(module.events).toHaveProperty('test2', testEvent2)
  })

  it('should have commands', () => {
    const testCommand1 = () => {}
    const testCommand2 = () => {}
    module = module.withCommand('test1', testCommand1)
    expect(module.commands).toHaveProperty('test1', testCommand1)
    module = module.withCommand('test2', testCommand2)
    expect(module.commands).toHaveProperty('test1', testCommand1)
    expect(module.commands).toHaveProperty('test2', testCommand2)
  })

  it('should have imports', () => {
    const nestedModule1 = new Module()
    const nestedModule2 = new Module()
    module = module.withImports({ nested1: nestedModule1 })
    expect(module.imports).toHaveProperty('nested1', nestedModule1)
    module = module.withImports({ nested2: nestedModule2 })
    expect(module.imports).toHaveProperty('nested1', nestedModule1)
    expect(module.imports).toHaveProperty('nested2', nestedModule2)
  })

  it('should have initalizer', () => {
    const initalizer = noop
    module = module.withInitializer(initalizer)
    expect(module.initializer).toBe(initalizer)
    expect(() => module.withInitializer(initalizer)).toThrow()
  })
})
