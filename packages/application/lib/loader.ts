import { readdir } from 'node:fs/promises'
import { join, sep } from 'node:path'
import { LoaderInterface } from './types'

export class LoaderError extends Error {}
export class Loader<T> implements LoaderInterface<T> {
  readonly modules = new Map<string, T>()

  constructor(protected readonly root: string) {}

  async load() {
    const read = async (dir: string, level = 0) => {
      // TODO: potential max call stack exception? maybe use loop instead of recursion
      const entries = await readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue
        if (entry.isFile()) {
          if (entry.name.endsWith('.d.ts')) continue
          let [baseName, ...leading] = entry.name.split('.')
          const ext = leading.join('.')
          if (['js', 'mjs', 'cjs', 'ts', 'mts', 'cts'].includes(ext)) {
            const levelName = dir
              .slice(this.root.length + 1)
              .split(sep)
              .join('/')
            const entryName = level && baseName === 'index' ? null : baseName
            const name = [levelName, entryName].filter(Boolean).join('/')
            await this.import(name, join(dir, entry.name))
          }
        }
        if (entry.isDirectory()) await read(join(dir, entry.name), level + 1)
      }
    }
    await read(this.root)
  }

  protected async import(name: string, path: string): Promise<T> {
    try {
      const { default: module } = await import(path)
      this.modules.set(name, module)
      return module
    } catch (cause) {
      new LoaderError(`Unable to import module ${path}`, { cause })
    }
  }
}
