import swc from '@swc/core'
import { readFile } from 'node:fs/promises'
import { isBuiltin } from 'node:module'
import { basename } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createMatchPath, loadConfig } from 'tsconfig-paths'

const tsExtensions = ['.mts', '.cts', '.ts']
const dtsExtensions = tsExtensions.map((ext) => `.d${ext}`)

// TODO: this might need to do for each import, and not resolve just top-level tsconfig
// need more tests
const configLoaderResult = loadConfig(process.cwd())

const matchPath =
  configLoaderResult.resultType === 'failed'
    ? undefined
    : createMatchPath(
        configLoaderResult.absoluteBaseUrl,
        configLoaderResult.paths,
        configLoaderResult.mainFields,
        configLoaderResult.addMatchAll,
      )

const isRelativePath = (path) => path.startsWith('.')
const isAbsolutePath = (path) => path.startsWith('/')
const isFileUrl = (path) => path.startsWith('file://')

const isPath = (path) =>
  isFileUrl(path) || isRelativePath(path) || isAbsolutePath(path)

const toFileUrl = (val, parentURL) => {
  if (val instanceof URL) return val
  if (isFileUrl(val)) return new URL(val)
  return isRelativePath(val) ? new URL(val, parentURL) : pathToFileURL(val)
}

const isTs = (path) => {
  // biome-ignore lint/style/noParameterAssign:
  path = isFileUrl(path) ? new URL(path).pathname : path
  const [_, ...extensions] = basename(path).split('.')
  const toExtname = (parts) => `.${parts.join('.')}`
  const isDts = dtsExtensions.includes(toExtname(extensions.slice(-2)))
  const isTs = tsExtensions.includes(toExtname(extensions.slice(-1)))
  return !isDts && isTs
}

const fileContents = (path) => readFile(path, 'utf8')

const transform = async (specifier) => {
  const url = isFileUrl(specifier)
    ? new URL(specifier)
    : pathToFileURL(specifier)
  const contents = await fileContents(fileURLToPath(url))
  const { code } = await swc.transform(contents, {
    module: { type: 'nodenext', ignoreDynamic: true },
    filename: fileURLToPath(url),
    isModule: true,
    sourceFileName: fileURLToPath(url),
    sourceMaps: 'inline',
    minify: false,
    jsc: {
      keepClassNames: true,
      parser: {
        decorators: true,
        dynamicImport: true,
        tsx: true,
        syntax: 'typescript',
      },
      target: 'esnext',
    },
  })
  return code
}

const isIgnored = (path) =>
  path.includes('/node_modules/') || path.includes('/dist/')

// Resolve hook, see https://nodejs.org/docs/latest-v18.x/api/module.html#resolvespecifier-context-nextresolve
export async function resolve(specifier, context, nextResolve) {
  if (!isBuiltin(specifier)) {
    let customUrl

    if (isPath(specifier) && isTs(specifier)) {
      customUrl = toFileUrl(specifier, context.parentURL)
    } else if (configLoaderResult.resultType !== 'failed') {
      const found = matchPath(specifier)
      if (found) customUrl = pathToFileURL(found)
    }

    if (customUrl) {
      const { url } = await nextResolve(`${customUrl}`, context)
      return {
        shortCircuit: true,
        format: 'module',
        importAttributes: context.importAttributes,
        url: url.toString(),
      }
    }
  }

  return nextResolve(specifier, context)
}

// Load hook, see https://nodejs.org/docs/latest-v18.x/api/module.html#loadurl-context-nextload
export async function load(specifier, context, nextResolve) {
  if (configLoaderResult.resultType === 'failed' || isBuiltin(specifier))
    return nextResolve(specifier, context)

  if (isPath(specifier) && !isIgnored(specifier) && isTs(specifier)) {
    return {
      format: 'module',
      shortCircuit: true,
      source: await transform(specifier),
    }
  }

  return nextResolve(specifier, context)
}
