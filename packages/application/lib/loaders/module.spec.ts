import { testApp } from '@test/_utils'

import { join, resolve } from 'node:path'
import type { Application } from '../application'
import { ModuleLoader } from '../loaders/module'
import type { RegistryModuleType } from '../registry'

const fixturesRoot = 'packages/application/test/fixtures'

describe.sequential('Loaders -> Module', () => {
  let app: Application
  let loader: ModuleLoader
  const root = resolve(fixturesRoot, 'loaders/module')
  const types = ['events', 'procedures', 'tasks'] as RegistryModuleType[]
  const keys = [
    ['module1', 'test', () => 'test', (type) => join('module1', type)],
    [
      'module2',
      'test',
      () => 'default',
      (type) => join('module2', type, 'test'),
    ],
    [
      'module2',
      'nested/test',
      () => 'default',
      (type) => join('module2', type, 'nested/test'),
    ],
    ['module3', 'test', (type) => `default.${type}.test`, () => 'module3'],
    ['module4', 'test', (type) => `${type}.test`, () => 'module4'],
  ] as const

  beforeAll(async () => {
    loader = new ModuleLoader({ root })
    app = testApp({
      loaders: [loader],
    })
    await app.registry.load()
  })

  for (const type of types) {
    it(`should load ${type}`, async () => {
      for (const [module, key, exportNameFn, pathFn] of keys) {
        const path = join(root, pathFn(type)) + '.ts'
        const name = [module, key].join('/')
        const exportName = exportNameFn(type)
        expect(app.registry[type].has(name)).toBe(true)
        expect(app.registry[type].get(name)?.path).toBe(path)
        expect(app.registry[type].get(name)?.exportName).toBe(
          exportName
            .split('.')
            .map((v) => `["${v}"]`)
            .join(''),
        )
        expect(app.registry[type].get(name)?.module).toBe(
          await import(path).then((m) =>
            exportName.split('.').reduce((o, k) => o[k], m),
          ),
        )
      }
    })
  }
})
