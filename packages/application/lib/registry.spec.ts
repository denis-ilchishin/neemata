import { testEvent, testLogger, testProcedure, testTask } from '@test/_utils'
import { Scope } from './common'
import { Provider } from './container'
import { Module } from './module'
import { Registry } from './registry'
import { noop } from './utils/functions'

describe(() => {
  const logger = testLogger()
  let registry: Registry

  beforeEach(() => {
    const testModule = new Module()
      .withProcedures({
        test: testProcedure().withHandler(noop),
      })
      .withTasks({
        test: testTask().withHandler(noop),
      })
      .withEvents({
        test: testEvent(),
      })
      .withCommand('test', noop)

    registry = new Registry({ logger, modules: { test: testModule } })
  })

  describe.sequential('Registry', () => {
    it('should be a registry', () => {
      expect(registry).toBeDefined()
      expect(registry).toBeInstanceOf(Registry)
    })

    it('should load modules', async () => {
      await registry.load()
      expect(registry.procedures.has('test/test')).toBe(true)
      expect(registry.tasks.has('test/test')).toBe(true)
      expect(registry.events.has('test/test')).toBe(true)
      const taskCommand = registry.commands.get('test')?.get('test')
      expect(taskCommand).toBeDefined()
      expect(taskCommand).toBeTypeOf('function')
    })
  })

  describe.sequential('Registry -> Procedure', () => {
    it('should register procedure', () => {
      const procedure = testProcedure().withHandler(noop)
      registry.registerProcedure('test', 'test', procedure)
      expect(registry.getByName('procedure', 'test/test')).toBe(procedure)
    })

    it('should fail register procedure without handler', () => {
      const procedure = testProcedure()
      expect(() =>
        registry.registerProcedure('test', 'test', procedure),
      ).toThrow()
    })

    it('should fail register duplicate procedure', () => {
      const procedure = testProcedure().withHandler(noop)
      registry.registerProcedure('test', 'test', procedure)
      expect(() =>
        registry.registerProcedure('test', 'test', procedure),
      ).toThrow()
    })
  })

  describe.sequential('Registry -> Task', () => {
    it('should register task', () => {
      const task = testTask().withHandler(noop)
      registry.registerTask('test', 'test', task)
      expect(registry.getByName('task', 'test/test')).toBe(task)
    })

    it('should fail register task without handler', () => {
      const task = testTask()
      expect(() => registry.registerTask('test', 'test', task)).toThrow()
    })

    it('should fail register duplicate task', () => {
      const task = testTask().withHandler(noop)
      registry.registerTask('test', 'test', task)
      expect(() => registry.registerTask('test', 'test', task)).toThrow()
    })

    it('should fail register task with non-global dependencies', () => {
      const provider = new Provider().withScope(Scope.Connection)
      const task = testTask().withHandler(noop).withDependencies({ provider })
      expect(() => registry.registerTask('test', 'test', task)).toThrow()
    })
  })

  describe.sequential('Registry -> Event', () => {
    it('should register event', () => {
      const event = testEvent()
      registry.registerEvent('test', 'test', event)
      expect(registry.getByName('event', 'test/test')).toBe(event)
    })

    it('should fail register duplicate event', () => {
      const event = testEvent()
      registry.registerEvent('test', 'test', event)
      expect(() => registry.registerEvent('test', 'test', event)).toThrow()
    })
  })
})
