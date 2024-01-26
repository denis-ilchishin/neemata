import { readdir } from 'node:fs/promises'
import { join, parse } from 'node:path'
import { BaseCustomLoader } from '../loader'
import { isJsFile } from '../utils/functions'
import { PlainLoader } from './plain'

export class ModuleLoader implements BaseCustomLoader {
  constructor(
    private readonly options: {
      root: string
      baseName?: string
      events?: string
      procedures?: string
      tasks?: string
    },
  ) {}

  async load() {
    const {
      root,
      baseName,
      procedures = 'procedures',
      tasks = 'tasks',
      events = 'events',
    } = this.options

    const result = {
      procedures: {},
      tasks: {},
      events: {},
    }

    const composeName = (featureName, name) =>
      [baseName, featureName, name].filter(Boolean).join('/')

    const entries = await readdir(root, { withFileTypes: true })

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const { name: featureName } = parse(entry.name)
      if (entry.isFile()) {
        const { default: defaultExport } = await import(join(root, entry.name))
        if (typeof defaultExport === 'undefined') continue
        for (const type of ['procedures', 'tasks', 'events']) {
          for (const [name, module] of Object.entries(
            defaultExport[type] ?? {},
          )) {
            result[type][composeName(featureName, name)] = {
              module,
              path: join(root, entry.name),
              exportName: `["default"]["${type}"]["${name}"]`,
            }
          }
        }
      }
      if (entry.isDirectory()) {
        const dirEntries = await readdir(join(root, entry.name), {
          withFileTypes: true,
        })
        for (const dirEntry of dirEntries) {
          if (dirEntry.name.startsWith('.')) continue
          const type = dirEntry.isFile()
            ? parse(dirEntry.name).name
            : dirEntry.name

          switch (type) {
            case procedures:
            case tasks:
            case events:
              if (dirEntry.isFile()) {
                if (!isJsFile(dirEntry.name)) continue
                const { default: defaultExport, ...exports } = await import(
                  join(root, entry.name, dirEntry.name)
                )
                for (const [name, module] of Object.entries(
                  defaultExport ?? exports,
                )) {
                  result[type][composeName(featureName, name)] = {
                    module,
                    path: join(root, entry.name, dirEntry.name),
                    exportName: `["${name}"]`,
                  }
                }
              }

              if (dirEntry.isDirectory()) {
                const plainLoader = new PlainLoader({
                  [type]: join(root, entry.name, dirEntry.name),
                })
                const loaded = await plainLoader.load()
                const modules = Object.entries<any>(loaded[type])
                for (const [name, module] of modules) {
                  result[type][composeName(featureName, name)] = module
                }
              }
              break
          }
        }
      }
    }

    return result
  }

  paths() {
    return [this.options.root]
  }
}
