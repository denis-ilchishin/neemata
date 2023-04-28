const { readFilesystem, SEPARATOR } = require('./loader')
const {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
} = require('node:fs')
const { join, sep, parse, relative, dirname } = require('node:path')
const { writeFile } = require('node:fs/promises')
const { capitalize } = require('./utils/functions')
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
  const namespaces = ['config', 'lib', 'services', 'db', 'tasks']
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
    const typing = `Resolve<typeof ${alias}>`
    if (alias in imports) return typing
    imports[alias] = relative(outputPath, path)
    return typing
  }

  for (const namespace of namespaces) {
    const tree = await readFilesystem(
      join(applicationPath, namespace),
      !['db', 'config'].includes(namespace),
      ['tasks'].includes(namespace)
    )

    const interface = new DTSInterface(capitalize(namespace))
    const nest = (interface, key, value) => {
      const keys = Object.keys(value)
      const nested = keys.filter((key) => key !== 'index')
      const index = keys.find((key) => key === 'index')
        ? interface.addProperty(new DTSProperty(key, addImport(value.index)))
        : null
      if (nested.length) {
        const object = new DTSObject(key)
        for (const key of nested) nest(object, key, value[key])
        if (index) index.type = `Merge<${index.type}, ${object.toString(true)}>`
        else interface.addProperty(object)
      }
    }

    for (const [key, value] of Object.entries(tree)) {
      if (namespace === 'tasks')
        interface.addProperty(new DTSProperty(`'${key}'`, addImport(value)))
      else nest(interface, key, value)
    }

    interfaces.push(interface)
  }

  const apiInterface = new DTSInterface('Api')
  const apiPath = join(applicationPath, 'api')
  const apiModules = await readFilesystem(apiPath, true, true)

  for (const path of Object.values(apiModules).sort().reverse()) {
    const { dir, name: filename } = parse(path.replace(apiPath, '').slice(1))
    const nameParts = []
    const versionParts = []
    const dirpath = (dir ? dir.split(sep) : []).map((part) => part.split('.'))
    dirpath.push(filename.split('.'))
    for (const [name, ...versions] of dirpath) {
      if (name !== 'index') nameParts.push(name)
      versionParts.push(...versions)
    }
    if (versionParts.length > 1) continue
    const version = versionParts.length ? parseInt(versionParts[0]) : 1
    if (!Number.isSafeInteger(version) || version <= 0) continue
    let last = apiInterface
    for (let i = 0; i < nameParts.length; i++) {
      const isLast = i === nameParts.length - 1
      const isFirstVer = isLast && version === 1
      const part = nameParts[i]
      if (isLast && isFirstVer && last.hasProperty(part))
        last.getProperty(part).type = `ApiCall<${addImport(path)}>`

      last = last.hasProperty(part)
        ? last.getProperty(part)
        : last.addProperty(
            new DTSObject(
              part,
              isLast && isFirstVer ? `ApiCall<${addImport(path)}>` : null
            )
          )
      if (isLast)
        last.addProperty(
          new DTSProperty(`v${version}`, `ApiCall<${addImport(path)}>`)
        )
    }
  }
  interfaces.push(apiInterface)

  const injectionsInterface = new DTSInterface('Injections')
  for (const namespace of namespaces) {
    if (namespace === 'tasks') continue
    const tree = await readFilesystem(
      join(applicationPath, namespace),
      !['db', 'config'].includes(namespace),
      true
    )
    for (const [key, value] of Object.entries(tree)) {
      const name = `'${namespace}${SEPARATOR}${key}'`
      const property = new DTSProperty(name, addImport(value))
      injectionsInterface.addProperty(property)
    }
  }
  interfaces.push(injectionsInterface)

  const importsContent = Object.entries(imports)
    .map(([alias, path]) => {
      path = path.replace(/\.ts$/, '')
      return `import * as ${alias} from '${path}'`
    })
    .join('\n')

  const fileContent = [
    '/// <reference types="@neemata/core/types/external" />',
    importsContent,
    readFileSync(join(__dirname, '..', 'templates', 'utils.d.ts'), {
      encoding: 'utf-8',
    }),
    `declare module '@neemata/core/types/external' {
    ${interfaces.join('\n')}
    }`,
    `export { Api as ClientApi } from '@neemata/core/types/external'`,
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
      (typeOnly ? '' : `${this.name}${this.optional ? '?' : ''}:`) + this.type
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
