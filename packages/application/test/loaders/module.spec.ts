import { testApp } from '../_utils'

import { Application } from '@/application'
import { ModuleLoader } from '@/loaders/module'
import { join, resolve } from 'node:path'

describe.sequential('Loaders -> Plain', () => {
  let app: Application

  beforeAll(async () => {
    app = testApp({
      loaders: [
        new ModuleLoader({
          root: join(__dirname, '../fixtures/loaders/module'),
        }),
      ],
    })
    await app.loader.load()
  })

  it('should load events', async () => {
    const filename1 = '../fixtures/loaders/module/module1/events.ts'
    expect(app.loader.events).toHaveProperty('module1/test')
    expect(app.loader.events['module1/test'].path).toBe(
      resolve(__dirname, filename1),
    )
    expect(app.loader.events['module1/test'].exportName).toBe('["test"]')
    expect(app.loader.events['module1/test'].module).toBe(
      await import(filename1).then((m) => m.test),
    )

    const filename2 = '../fixtures/loaders/module/module2/events/test.ts'
    expect(app.loader.events).toHaveProperty('module2/test')
    expect(app.loader.events['module2/test'].path).toBe(
      resolve(__dirname, filename2),
    )
    expect(app.loader.events['module2/test'].exportName).toBe('["default"]')
    expect(app.loader.events['module2/test'].module).toBe(
      await import(filename2).then((m) => m.default),
    )

    const filename3 = '../fixtures/loaders/module/module2/events/nested/test.ts'
    expect(app.loader.events).toHaveProperty('module2/nested/test')
    expect(app.loader.events['module2/nested/test'].path).toBe(
      resolve(__dirname, filename3),
    )
    expect(app.loader.events['module2/nested/test'].exportName).toBe(
      '["default"]',
    )
    expect(app.loader.events['module2/nested/test'].module).toBe(
      await import(filename3).then((m) => m.default),
    )
  })

  it('should load tasks', async () => {
    const filename1 = '../fixtures/loaders/module/module1/procedures.ts'
    expect(app.loader.procedures).toHaveProperty('module1/test')
    expect(app.loader.procedures['module1/test'].path).toBe(
      resolve(__dirname, filename1),
    )
    expect(app.loader.procedures['module1/test'].exportName).toBe('["test"]')
    expect(app.loader.procedures['module1/test'].module).toBe(
      await import(filename1).then((m) => m.test),
    )

    const filename2 = '../fixtures/loaders/module/module2/procedures/test.ts'
    expect(app.loader.procedures).toHaveProperty('module2/test')
    expect(app.loader.procedures['module2/test'].path).toBe(
      resolve(__dirname, filename2),
    )
    expect(app.loader.procedures['module2/test'].exportName).toBe('["default"]')
    expect(app.loader.procedures['module2/test'].module).toBe(
      await import(filename2).then((m) => m.default),
    )

    const filename3 =
      '../fixtures/loaders/module/module2/procedures/nested/test.ts'
    expect(app.loader.procedures).toHaveProperty('module2/nested/test')
    expect(app.loader.procedures['module2/nested/test'].path).toBe(
      resolve(__dirname, filename3),
    )
    expect(app.loader.procedures['module2/nested/test'].exportName).toBe(
      '["default"]',
    )
    expect(app.loader.procedures['module2/nested/test'].module).toBe(
      await import(filename3).then((m) => m.default),
    )
  })

  it('should load tasks', async () => {
    const filename1 = '../fixtures/loaders/module/module1/tasks.ts'
    expect(app.loader.tasks).toHaveProperty('module1/test')
    expect(app.loader.tasks['module1/test'].path).toBe(
      resolve(__dirname, filename1),
    )
    expect(app.loader.tasks['module1/test'].exportName).toBe('["test"]')
    expect(app.loader.tasks['module1/test'].module).toBe(
      await import(filename1).then((m) => m.test),
    )

    const filename2 = '../fixtures/loaders/module/module2/tasks/test.ts'
    expect(app.loader.tasks).toHaveProperty('module2/test')
    expect(app.loader.tasks['module2/test'].path).toBe(
      resolve(__dirname, filename2),
    )
    expect(app.loader.tasks['module2/test'].exportName).toBe('["default"]')
    expect(app.loader.tasks['module2/test'].module).toBe(
      await import(filename2).then((m) => m.default),
    )

    const filename3 = '../fixtures/loaders/module/module2/tasks/nested/test.ts'
    expect(app.loader.tasks).toHaveProperty('module2/nested/test')
    expect(app.loader.tasks['module2/nested/test'].path).toBe(
      resolve(__dirname, filename3),
    )
    expect(app.loader.tasks['module2/nested/test'].exportName).toBe(
      '["default"]',
    )
    expect(app.loader.tasks['module2/nested/test'].module).toBe(
      await import(filename3).then((m) => m.default),
    )
  })
})
