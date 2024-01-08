import { readdir } from 'node:fs/promises'
import { join, sep } from 'node:path'
import { LoaderInterface } from './types'

export class LoaderError extends Error {}

export class Loader<T> implements LoaderInterface<T> {
  readonly modules = new Map<string, T>()
  readonly names = new Map<T, string>()
  readonly paths = new Map<string, string>()

  constructor(protected readonly root: string) {}

  async load() {
    if (!this.root) return
    const read = async (dir: string, level = 0) => {
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
            const path = join(dir, entry.name)
            try {
              const { default: module } = await import(path)
              if (typeof module !== 'undefined') this.set(name, module, path)
            } catch (cause) {
              throw new LoaderError(`Unable to import module ${path}`, {
                cause,
              })
            }
          }
        }
        if (entry.isDirectory()) await read(join(dir, entry.name), level + 1)
      }
    }
    await read(this.root)
  }

  protected set(name: string, module: any, path?: string) {
    this.modules.set(name, module)
    this.names.set(module, name)
    if (path) this.paths.set(name, path)
  }

  clear() {
    this.modules.clear()
    this.names.clear()
    this.paths.clear()
  }
}
