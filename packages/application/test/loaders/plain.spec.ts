import { testApp } from '../_utils'

import { join, resolve } from 'node:path'
import { Application } from '@/application'
import { PlainLoader } from '@/loaders/plain'

describe.sequential('Loaders -> Plain', () => {
  let app: Application

  beforeAll(async () => {
    app = testApp({
      loaders: [
        new PlainLoader({
          events: join(__dirname, '../fixtures/loaders/plain/events'),
          procedures: join(__dirname, '../fixtures/loaders/plain/procedures'),
          tasks: join(__dirname, '../fixtures/loaders/plain/tasks'),
        }),
      ],
    })
    await app.loader.load()
  })

  it('should load events', async () => {
    const filename1 = '../fixtures/loaders/plain/events/test.ts'
    expect(app.loader.events).toHaveProperty('test')
    expect(app.loader.events.test.path).toBe(resolve(__dirname, filename1))
    expect(app.loader.events.test.exportName).toBe('["default"]')
    expect(app.loader.events.test.module).toBe(
      await import(filename1).then((m) => m.default),
    )

    const filename2 = '../fixtures/loaders/plain/events/nested/test.ts'
    expect(app.loader.events).toHaveProperty('nested/test')
    expect(app.loader.events['nested/test'].path).toBe(
      resolve(__dirname, filename2),
    )
    expect(app.loader.events['nested/test'].exportName).toBe('["default"]')
    expect(app.loader.events['nested/test'].module).toBe(
      await import(filename2).then((m) => m.default),
    )
  })

  it('should load procedures', async () => {
    const filename1 = '../fixtures/loaders/plain/procedures/test.ts'
    expect(app.loader.procedures).toHaveProperty('test')
    expect(app.loader.procedures.test.path).toBe(resolve(__dirname, filename1))
    expect(app.loader.procedures.test.exportName).toBe('["default"]')
    expect(app.loader.procedures.test.module).toBe(
      await import(filename1).then((m) => m.default),
    )

    const filename2 = '../fixtures/loaders/plain/procedures/nested/test.ts'
    expect(app.loader.procedures).toHaveProperty('nested/test')
    expect(app.loader.procedures['nested/test'].path).toBe(
      resolve(__dirname, filename2),
    )
    expect(app.loader.procedures['nested/test'].exportName).toBe('["default"]')
    expect(app.loader.procedures['nested/test'].module).toBe(
      await import(filename2).then((m) => m.default),
    )
  })

  it('should load tasks', async () => {
    const filename1 = '../fixtures/loaders/plain/tasks/test.ts'
    expect(app.loader.tasks).toHaveProperty('test')
    expect(app.loader.tasks.test.path).toBe(resolve(__dirname, filename1))
    expect(app.loader.tasks.test.exportName).toBe('["default"]')
    expect(app.loader.tasks.test.module).toBe(
      await import(filename1).then((m) => m.default),
    )

    const filename2 = '../fixtures/loaders/plain/tasks/nested/test.ts'
    expect(app.loader.tasks).toHaveProperty('nested/test')
    expect(app.loader.tasks['nested/test'].path).toBe(
      resolve(__dirname, filename2),
    )
    expect(app.loader.tasks['nested/test'].exportName).toBe('["default"]')
    expect(app.loader.tasks['nested/test'].module).toBe(
      await import(filename2).then((m) => m.default),
    )
  })
})
