const fs = require('node:fs')
const { resolve, join, sep, parse, relative, dirname } = require('node:path')
const TscWatch = require('tsc-watch/client')

function capitalize(str) {
  return str[0].toUpperCase() + str.slice(1)
}

function dirTree(applicationPath, module) {
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
      /\.(mjs|js)/.test(ext) &&
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
    const { dir, name, ext } = parse(file)
    if (name.startsWith('_') || name.startsWith('.')) continue

    const parts = dir ? dir.split(sep) : []
    parts.push(name)

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

    last = tree
  }

  return tree
}

function getIndex(applicationPath) {
  const modules = ['config', 'lib', 'services', 'db']

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
    imports[alias] = path
    if (ext === '.mjs') {
      return `${alias}['default'] & Omit<typeof ${alias}, 'default'>`
    } else {
      return alias
    }
  }

  for (const module of modules) {
    const tree = dirTree(resolve(applicationPath, module), module)

    let interfaceContent = `
        interface ${capitalize(module)} {
      `

    const concatenate = (value) => {
      if (typeof value === 'object') {
        let res = ''

        if ('_' in value) {
          res += `typeof ${addImport(value._)} &`
        }

        res += '{\n'

        for (const [key, val] of Object.entries(value)) {
          if (key === '_') continue
          res += `'${key}': ${concatenate(val)}\n`
        }

        res += '}\n'

        return res
      } else {
        return `typeof ${addImport(value)}`
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
    .map(
      ([alias, path]) =>
        `import ${
          path.endsWith('mjs') ? `* as ${alias}` : alias
        } from '${path}'`
    )
    .join('\n')

  const fileContent = `
    ${importsContent}

    declare module 'neemata' {
    ${interfaces.join('')}
    }`

  return fileContent
}

class Typings {
  constructor(rootPath, silent = true) {
    this.applicationPath = rootPath
    this.outputDir = join(process.cwd(), '.neemata')
    this.outputTypesDir = join(this.outputDir, 'types')
    this.silent = silent
  }

  watch() {
    if (this.watcher) return

    this.watcher = new TscWatch()

    try {
      if (!fs.statSync(this.outputDir).isDirectory()) {
        throw new Error()
      }
    } catch (error) {
      fs.mkdirSync(this.outputDir)
    }

    const relativeApplicationPath = relative(
      this.outputDir,
      this.applicationPath
    )
    const relativeCwdPath = relative(this.outputDir, process.cwd())

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
            baseUrl: '.',
            esModuleInterop: true,
            types: ['neemata'],
            strict: true,
            outDir: './types',
            rootDir: relativeApplicationPath,
          },
          include: [
            join(relativeApplicationPath, '/**/*.js'),
            join(relativeApplicationPath, '/**/*.mjs'),
          ],
          exclude: [
            join(relativeApplicationPath, '/api'),
            join(relativeApplicationPath, '/tasks'),
            join(relativeCwdPath, 'types'),
            join(relativeCwdPath, 'tsconfig.json'),
          ],
        },
        null,
        2
      )
    )

    const args = ['--project', join(this.outputDir, 'tsconfig.json')]
    if (this.silent) args.push('--silent')

    this.watcher.on('success', () => this.compile())
    this.watcher.on('error', () => console.error('Typings watcher error'))
    this.watcher.start(...args)
  }

  compile() {
    fs.writeFileSync(
      join(this.outputTypesDir, 'index.d.ts'),
      getIndex(this.applicationPath),
      { flag: 'w' }
    )
  }

  stop() {
    this.watcher.kill()
  }
}

module.exports = {
  Typings,
}
