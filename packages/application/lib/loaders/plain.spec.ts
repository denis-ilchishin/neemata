import { join, resolve } from 'node:path'
import { testApp } from '@test/_utils'
import type { Application } from '../application'
import { PlainLoader } from '../loaders/plain'

const fixturesRoot = 'packages/application/test/fixtures'

describe.sequential('Loaders -> Plain', () => {
  let app: Application
  const eventsDir = resolve(fixturesRoot, 'loaders/plain/events')
  const proceduresDir = resolve(fixturesRoot, 'loaders/plain/procedures')
  const tasksDir = resolve(fixturesRoot, 'loaders/plain/tasks')
  const keys = ['test', 'nested/test']

  beforeAll(async () => {
    app = testApp({
      loaders: [
        new PlainLoader({
          events: eventsDir,
          procedures: proceduresDir,
          tasks: tasksDir,
        }),
      ],
    })
    await app.registry.load()
  })

  describe('Events', () => {
    it('should load event', async () => {
      for (const key of keys) {
        const filename = join(eventsDir, `${key}.ts`)
        expect(app.registry.events.has(key)).toBe(true)
        expect(app.registry.events.get(key)?.path).toBe(
          resolve(__dirname, filename),
        )
        expect(app.registry.events.get(key)?.exportName).toBe('["default"]')
        expect(app.registry.events.get(key)?.module).toBe(
          await import(filename).then((m) => m.default),
        )
      }
    })
  })

  describe('Procedures', () => {
    it('should load procedure', async () => {
      for (const key of keys) {
        const filename = join(proceduresDir, `${key}.ts`)
        expect(app.registry.procedures.has(key)).toBe(true)
        expect(app.registry.procedures.get(key)?.path).toBe(
          resolve(__dirname, filename),
        )
        expect(app.registry.procedures.get(key)?.exportName).toBe('["default"]')
        expect(app.registry.procedures.get(key)?.module).toBe(
          await import(filename).then((m) => m.default),
        )
      }
    })
  })

  describe('Tasks', () => {
    it('should load task', async () => {
      for (const key of keys) {
        const filename = join(tasksDir, `${key}.ts`)
        expect(app.registry.tasks.has(key)).toBe(true)
        expect(app.registry.tasks.get(key)?.path).toBe(
          resolve(__dirname, filename),
        )
        expect(app.registry.tasks.get(key)?.exportName).toBe('["default"]')
        expect(app.registry.tasks.get(key)?.module).toBe(
          await import(filename).then((m) => m.default),
        )
      }
    })
  })
})
