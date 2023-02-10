const fs = require('node:fs')
const { resolve, join, sep, parse, relative, dirname } = require('node:path')

function capitalize(str) {
  return str[0].toUpperCase() + str.slice(1)
}

function dirTree(applicationPath, module, flat = false) {
  const files = []

  const traverse = (path, name = '') => {
    const _path = join(path, name)
    const { base, ext } = parse(_path)
    const stat = fs.statSync(_path)
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(_path)) {
        traverse(_path, name)
      }
    } else if (
      /\.(mjs|js|ts)/.test(ext) &&
      !base.startsWith('.') &&
      !base.startsWith('_')
    ) {
      files.push(_path.replace(applicationPath + sep, ''))
    }
  }

  traverse(applicationPath)

  const tree = {}
  let last = tree

  for (const file of files) {
    const { dir, name } = parse(file)
    if (name.startsWith('_') || name.startsWith('.')) continue

    const parts = dir ? dir.split(sep) : []
    parts.push(name)

    if (flat) {
      last[parts.join('.')] = join(applicationPath, file).replace(
        applicationPath,
        './' + join(module)
      )
    } else {
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i]
        last[part] = last[part] ?? {}

        if (i + 1 === parts.length) {
          const dtsPath = join(applicationPath, file).replace(
            applicationPath,
            './' + join(module)
          )
          last[part] =
            typeof last[part] === 'object' && Object.keys(last[part]).length
              ? { _: dtsPath, ...last[part] }
              : dtsPath
        } else {
          last = last[part]
        }
      }
    }

    last = tree
  }

  return tree
}

function getIndex(applicationPath, outputTypesDir) {
  const modules = ['config', 'lib', 'services', 'db', 'tasks']

  const interfaces = []
  const imports = {}

  const addImport = (path) => {
    const { ext } = parse(path)

    const alias = path
      .slice(2)
      .replace(ext, '')
      .split(sep)
      .join('_')
      .replaceAll('.', '_')
    imports[alias] = relative(outputTypesDir, resolve(applicationPath, path))
    return `typeof ${alias}`
  }

  for (const module of modules) {
    const tree = dirTree(
      resolve(applicationPath, module),
      module,
      module === 'tasks'
    )

    let interfaceContent = `
        interface ${capitalize(module)} {
      `

    const concatenate = (value) => {
      if (typeof value === 'object') {
        let res = ''

        if ('_' in value) {
          res += `${addImport(value._)} &`
        }

        res += '{\n'

        for (const [key, val] of Object.entries(value)) {
          if (key === '_') continue
          res += `'${key}': ${concatenate(val)}\n`
        }

        res += '}\n'

        return res
      } else {
        return addImport(value)
      }
    }

    for (const [key, value] of Object.entries(tree)) {
      interfaceContent += `
          '${key}': ${concatenate(value)}\n
        `
    }

    interfaceContent += '}\n'
    interfaces.push(interfaceContent)
  }

  const importsContent = Object.entries(imports)
    .map(([alias, path]) => {
      path = path.replace(/\.ts$/, '')
      return `import ${alias} from '${path}'`
    })
    .join('\n')

  const fileContent = [
    '/// <reference types="@neemata/core/types/external" />',
    importsContent,
    `declare module '@neemata/core/types/external' {
    ${interfaces.join('')}
    }`,
  ].join('\n')

  return fileContent
}

class Typings {
  constructor(rootPath) {
    this.applicationPath = rootPath
    this.outputDir = join(process.cwd(), '.neemata')

    try {
      if (!fs.statSync(this.outputDir).isDirectory()) {
        throw new Error()
      } else {
        fs.rmSync(this.outputDir, { recursive: true })
        fs.mkdirSync(this.outputDir)
      }
    } catch (error) {
      fs.mkdirSync(this.outputDir)
    }

    fs.writeFileSync(
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

  compile() {
    fs.writeFileSync(
      join(this.outputDir, 'index.d.ts'),
      getIndex(this.applicationPath, this.outputDir),
      { flag: 'w' }
    )
  }
}

module.exports = {
  Typings,
}
