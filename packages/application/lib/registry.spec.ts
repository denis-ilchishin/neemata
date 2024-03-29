import { testEvent, testLogger, testProcedure, testTask } from '@test/_utils'
import { Provider } from './container'
import { APP_COMMAND, type BaseCustomLoader, Registry } from './registry'
import { Scope } from './types'
import { noop } from './utils/functions'

class TestCustomLoader implements BaseCustomLoader {
  async load() {
    return {
      procedures: {
        test: {
          module: testProcedure().withHandler(noop),
          exportName: '',
          path: '',
        },
      },
      tasks: {
        test: {
          module: testTask().withHandler(noop),
          exportName: '',
          path: '',
        },
      },
      events: {
        test: {
          module: testEvent(),
          exportName: '',
          path: '',
        },
      },
    }
  }

  paths() {
    return []
  }
}

describe(() => {
  const logger = testLogger()
  let registry: Registry

  beforeEach(() => {
    registry = new Registry({ logger }, [new TestCustomLoader()])
  })

  describe.sequential('Registry', () => {
    it('should be a loader', () => {
      expect(registry).toBeDefined()
      expect(registry).toBeInstanceOf(Registry)
    })

    it('should load', async () => {
      await registry.load()
      expect(registry.procedures.has('test')).toBe(true)
      expect(registry.tasks.has('test')).toBe(true)
      expect(registry.events.has('test')).toBe(true)
    })

    it('should registry "task" command', () => {
      const taskCommand = registry.commands.get(APP_COMMAND)?.get('task')
      expect(taskCommand).toBeDefined()
      expect(taskCommand).toBeTypeOf('function')
    })
  })

  describe.sequential('Registry -> Procedure', () => {
    it('should register procedure', async () => {
      const procedure = testProcedure().withHandler(noop)
      registry.registerProcedure(procedure.name, procedure)
      expect(registry.procedure('test')).toBe(procedure)
    })

    it('should fail register procedure without handler', async () => {
      const procedure = testProcedure()
      expect(() =>
        registry.registerProcedure(procedure.name, procedure),
      ).toThrow()
    })

    it('should fail register duplicate procedure', async () => {
      const procedure = testProcedure().withHandler(noop)
      registry.registerProcedure(procedure.name, procedure)
      expect(() =>
        registry.registerProcedure(procedure.name, procedure),
      ).toThrow()
    })
  })

  describe.sequential('Registry -> Task', () => {
    it('should register task', async () => {
      const task = testTask().withHandler(noop)
      registry.registerTask(task.name, task)
      expect(registry.task(task.name)).toBe(task)
    })

    it('should fail register task without handler', async () => {
      const task = testTask()
      expect(() => registry.registerTask(task.name, task)).toThrow()
    })

    it('should fail register duplicate task', async () => {
      const task = testTask().withHandler(noop)
      registry.registerTask(task.name, task)
      expect(() => registry.registerTask(task.name, task)).toThrow()
    })

    it('should fail register task with non-global dependencies', async () => {
      const provider = new Provider().withScope(Scope.Connection)
      const task = testTask().withHandler(noop).withDependencies({ provider })
      expect(() => registry.registerTask(task.name, task)).toThrow()
    })
  })

  describe.sequential('Registry -> Event', () => {
    it('should register event', async () => {
      const event = testEvent()
      registry.registerEvent(event.name, event)
      expect(registry.event(event.name)).toBe(event)
    })

    it('should fail register duplicate event', async () => {
      const event = testEvent()
      registry.registerEvent(event.name, event)
      expect(() => registry.registerEvent(event.name, event)).toThrow()
    })
  })
})
