const { readFilesystem } = require('./loader')
const { existsSync, mkdirSync, writeFileSync } = require('node:fs')
const { join, sep, parse, relative, dirname, basename } = require('node:path')
const { writeFile } = require('node:fs/promises')
class Typings {
  constructor(rootPath, entryName) {
    this.applicationPath = rootPath
    this.entryName = entryName
    this.outputDir = join(process.cwd(), '.neemata')

    try {
      if (!existsSync(this.outputDir)) mkdirSync(this.outputDir)
    } catch (err) {
      looger.warn('Could not create typings directory')
      logger.warn(err)
    }

    const compilerOptions = {
      module: 'Node16',
      moduleResolution: 'node',
      target: 'ESNext',
      allowJs: true,
      declaration: true,
      emitDeclarationOnly: true,
      declarationMap: false,
      noEmit: false,
      alwaysStrict: true,
      baseUrl: dirname(relative(this.outputDir, this.applicationPath)),
      esModuleInterop: true,
      strict: true,
      rootDir: dirname(relative(this.outputDir, this.applicationPath)),
      noImplicitAny: false,
      paths: {
        '@app': [join('.', basename(this.applicationPath), this.entryName)],
      },
    }

    writeFileSync(
      join(this.outputDir, 'tsconfig.json'),
      JSON.stringify({ compilerOptions }, null, 2)
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
      logger.warn(err.stack || err)
    }
  }
}

async function generateDts(applicationPath, outputPath) {
  const namespaces = [
    ['config', false],
    ['lib', true],
    ['service', true],
    ['db', false],
    ['api', true],
  ]
  const injectables = new DTSInterface('Injectables')
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
    const typing = `Resolve<typeof ${alias}>`
    if (alias in imports) return typing
    imports[alias] = relative(outputPath, path)
    return typing
  }

  for (const [namespace, recursive] of namespaces) {
    const entries = await readFilesystem(
      join(applicationPath, namespace),
      recursive,
      namespace
    )
    for (const { name, path, alias } of entries) {
      const injectable = new DTSObject(name)
      injectable.addProperty(new DTSProperty('exports', addImport(path)))
      injectable.addProperty(new DTSProperty('alias', `"${alias}"`))
      injectables.addProperty(injectable)
    }
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
    `declare module '@neemata/core/types/external' {
    ${injectables}
    }`,
    `export { ClientApi } from '@neemata/core/types/external'`,
  ].join('\n')

  return fileContent
}

module.exports = {
  Typings,
}

class DTSProperty {
  name
  optional

  #type

  constructor(name, type, optional = false) {
    this.name = name
    this.#type = type
    this.optional = optional
  }

  get type() {
    return this.#type
  }

  set type(type) {
    this.#type = type
  }

  toString(typeOnly = false) {
    return (
      (typeOnly ? '' : `"${this.name}"${this.optional ? '?' : ''}:`) + this.type
    )
  }
}

class DTSObject extends DTSProperty {
  properties = new Map()
  constructor(name, type = null, optional = false) {
    super(name, type, optional)
  }

  get type() {
    return `${super.type ? super.type + ' & ' : ''}{
      ${[...this.properties.values()].join(';\n')}
    }`
  }

  set type(type) {
    super.type = type
  }

  addProperty(property) {
    this.properties.set(property.name, property)
    return this.properties.get(property.name)
  }

  hasProperty(name) {
    return this.properties.has(name)
  }

  getProperty(name) {
    return this.properties.get(name)
  }
}

class DTSInterface extends DTSObject {
  constructor(name) {
    super(name, null, false)
  }

  toString() {
    return `interface ${this.name} {
      ${[...this.properties.values()].join(';\n')}
    }`
  }
}
