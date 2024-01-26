import { readdir } from 'node:fs/promises'
import { join, sep } from 'node:path'
import { BaseCustomLoader, LoaderModuleType } from '../loader'
import { isJsFile } from '../utils/functions'

export class PlainLoader implements BaseCustomLoader {
  constructor(
    protected readonly options: {
      procedures?: string
      tasks?: string
      events?: string
    },
  ) {}

  async load() {
    const result = {
      procedures: {},
      tasks: {},
      events: {},
    }

    const read = async (
      type: LoaderModuleType,
      root: string,
      dir: string,
      level = 0,
    ) => {
      const entries = await readdir(dir, { withFileTypes: true })

      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue
        if (entry.isFile()) {
          if (isJsFile(entry.name)) {
            const [baseName] = entry.name.split('.')
            const levelName = dir
              .slice(root.length + 1)
              .split(sep)
              .join('/')
            const entryName = level && baseName === 'index' ? null : baseName
            const name = [levelName, entryName].filter(Boolean).join('/')
            const path = join(dir, entry.name)
            const { default: defaultExport } = await import(path)
            if (typeof defaultExport !== 'undefined')
              result[type][name] = {
                module: defaultExport,
                path,
                exportName: '["default"]',
              }
          }
        }
        if (entry.isDirectory())
          await read(type, root, join(dir, entry.name), level + 1)
      }
    }

    for (const type of Object.keys(result)) {
      const dir = this.options[type]
      if (dir) await read(type as keyof typeof result, dir, dir)
    }

    return result
  }

  paths() {
    return Object.values(this.options).filter(Boolean)
  }
}
