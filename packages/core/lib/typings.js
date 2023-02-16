const { readFilesystem } = require('./loader')
const { existsSync, rmSync, mkdirSync, writeFileSync } = require('node:fs')
const { join, sep, parse, relative, dirname } = require('node:path')
const { writeFile } = require('node:fs/promises')
class Typings {
  constructor(rootPath) {
    this.applicationPath = rootPath
    this.outputDir = join(process.cwd(), '.neemata')

    try {
      if (!existsSync(this.outputDir)) mkdirSync(this.outputDir)
    } catch (err) {
      looger.warn('Could not create typings directory')
      logger.warn(err)
    }

    writeFileSync(
      join(this.outputDir, 'tsconfig.json'),
      JSON.stringify(
        {
          compilerOptions: {
            module: 'Node16',
            moduleResolution: 'node',
            target: 'ESNext',
            allowJs: true,
            declaration: true,
            emitDeclarationOnly: true,
            declarationMap: true,
            noEmit: false,
            alwaysStrict: true,
            baseUrl: dirname(relative(this.outputDir, this.applicationPath)),
            esModuleInterop: true,
            strict: true,
            rootDir: dirname(relative(this.outputDir, this.applicationPath)),
            noImplicitAny: false,
          },
        },
        null,
        2
      )
    )
  }

  async compile() {
    try {
      await writeFile(
        join(this.outputDir, 'index.d.ts'),
        await generateDts(this.applicationPath, this.outputDir),
        { flag: 'w' }
      )
    } catch (err) {
      logger.warn('Could not generate typings')
      logger.warn(err)
    }
  }
}

function capitalize(str) {
  return str[0].toUpperCase() + str.slice(1)
}

const GENERICS = `type Merge<T, T2> = {
  [K in keyof T | keyof T2]: K extends keyof T2
    ? T2[K] extends symbol | number | string | boolean | undefined | null
      ? K extends keyof T
        ? T[K]
        : never
      : T2[K]
    : K extends keyof T
    ? T[K]
    : never
}
type IsEmpty<T> = keyof T extends never ? true : false
type Resolve<T> = IsEmpty<T> extends false
  ? 'default' extends keyof T
    ? T['default'] & Pick<T, Exclude<keyof T, 'default'>>
    : T
  : unknown`

async function generateDts(applicationPath, outputPath) {
  const scopes = ['config', 'lib', 'services', 'db', 'tasks']
  const interfaces = []
  const imports = {}

  const addImport = (path) => {
    const { ext } = parse(path)
    const alias = path
      .replace(applicationPath, '')
      .slice(1)
      .replace(ext, '')
      .split(sep)
      .join('_')
      .replaceAll('.', '_')
      .replaceAll('-', '_')
    imports[alias] = relative(outputPath, path)

    return `Resolve<typeof ${alias}>`
  }

  for (const scope of scopes) {
    const tree = await readFilesystem(
      join(applicationPath, scope),
      !['db', 'config'].includes(scope),
      scope === 'tasks'
    )

    let content = `interface ${capitalize(scope)} {\n`

    const concatenate = (tree) => {
      content = ''
      const keys = Object.keys(tree)
      const hasIndex = keys.find((key) => key === 'index')
      const nested = keys.filter((key) => key !== 'index')
      if (hasIndex && nested.length) content += `Merge<`
      if (hasIndex) content += `${addImport(tree.index)}`
      if (nested.length) {
        if (hasIndex) content += ', '
        content += '{\n'
        for (const key of nested) {
          content += `'${key}': ${concatenate(tree[key])}\n`
        }
        content += '}'
      }
      if (hasIndex && nested.length) content += `>`
      return content
    }

    for (const [key, value] of Object.entries(tree)) {
      if (scope === 'tasks') content += `'${key}': ${addImport(value)}\n`
      else content += `'${key}': ${concatenate(value)}\n`
    }

    content += '}\n'
    interfaces.push(content)
  }

  const importsContent = Object.entries(imports)
    .map(([alias, path]) => {
      path = path.replace(/\.ts$/, '')
      return `import * as ${alias} from '${path}'`
    })
    .join('\n')

  const fileContent = [
    '/// <reference types="@neemata/core/types/external" />',
    importsContent,
    GENERICS,
    `declare module '@neemata/core/types/external' {
    ${interfaces.join('')}
    }`,
  ].join('\n')

  return fileContent
}

module.exports = {
  Typings,
}
