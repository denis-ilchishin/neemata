import { readdir } from 'node:fs/promises'
import { join, sep } from 'node:path'

/** @typedef {ReturnType<typeof createLoader>} Loader */

/**
 * @param {string} root
 */
export const createLoader = (root) => {
  /** @type {Map<string, string>} */
  const modules = new Map()

  const reload = async () => {
    modules.clear()
    const read = async (dir, level = 0) => {
      // TODO: potential max call stack exceeded exception? maybe use loop instead of recursion
      const entries = await readdir(dir, {
        withFileTypes: true,
      })
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue
        if (entry.isFile()) {
          let [baseName, ...leading] = entry.name.split('.')
          const ext = leading.join('.')
          if (['js', 'mjs', 'cjs', 'ts', 'mts', 'cts'].includes(ext)) {
            const levelName = dir
              .replace(root, '')
              .split(sep)
              .filter(Boolean)
              .join('/')
            const entryName = level && baseName === 'index' ? null : baseName
            const name = [levelName, entryName].filter(Boolean).join('/')
            modules.set(name, join(dir, entry.name))
          }
        }
        if (entry.isDirectory()) await read(join(dir, entry.name), level + 1)
      }
    }
    await read(root)
  }

  return { modules, reload }
}
