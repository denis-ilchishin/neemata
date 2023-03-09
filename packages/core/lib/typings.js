const { readFilesystem } = require('./loader')
const { existsSync, mkdirSync, writeFileSync } = require('node:fs')
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

const GENERICS = `
type IsEmpty<T> = keyof T extends never ? true : false
type Resolve<T> = IsEmpty<T> extends false
  ? 'default' extends keyof T
    ? T['default'] & Pick<T, Exclude<keyof T, 'default'>>
    : T
  : unknown`

async function generateDts(applicationPath, outputPath) {
  const namespaces = ['config', 'lib', 'services', 'db']
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

  let content = `interface Injection {\n`
  for (const namespace of namespaces) {
    const entries = await readFilesystem(
      join(applicationPath, namespace),
      !['db', 'config'].includes(namespace),
      true
    )
    for (const [key, value] of Object.entries(entries))
      content += `'${namespace}/${key}': ${addImport(value)}\n`
  }
  content += '}\n'
  interfaces.push(content)

  content = `interface Tasks {\n`
  const entries = await readFilesystem(
    join(applicationPath, 'tasks'),
    true,
    true
  )
  for (const [key, value] of Object.entries(entries))
    content += `'${key}': ${addImport(value)}\n`
  content += '}\n'
  interfaces.push(content)

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
