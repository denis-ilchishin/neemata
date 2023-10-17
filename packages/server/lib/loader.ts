import { readdir } from 'node:fs/promises'
import { join, sep } from 'node:path'

import { Logger } from 'pino'
import { CONTEXT_SYMBOL, PROVIDER_SYMBOL } from './utils/definitions'

export class Loader<T extends AnyTaskDefinition | AnyProdecureDefinition> {
  readonly modules = new Map<string, T>()
  readonly contexts = new Set<AnyContextDefinition>()
  readonly providers = new Set<AnyProviderDefinition>()

  constructor(private readonly logger: Logger, private readonly root: string) {}

  async load() {
    this.modules.clear()
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
              .replace(this.root, '')
              .split(sep)
              .filter(Boolean)
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
      this.addDependencies(module)
      this.modules.set(name, module)
      return module
    } catch (cause) {
      this.logger.error(new Error(`Unable to import module ${path}`, { cause }))
    }
  }

  private addDependencies(
    module:
      | AnyContextDefinition
      | AnyProviderDefinition
      | AnyTaskDefinition
      | AnyProdecureDefinition
  ) {
    if (module?.dependencies) {
      for (const dep of Object.values(module.dependencies as Dependencies)) {
        switch (dep.injectableType) {
          case PROVIDER_SYMBOL:
            this.providers.add(dep as AnyProviderDefinition)
            break
          case CONTEXT_SYMBOL:
            this.contexts.add(dep as AnyContextDefinition)
            break
          default:
            continue
        }
        this.addDependencies(dep)
      }
    }
  }
}
