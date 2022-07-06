const fs = require('fs')
const { resolve, join, extname, sep, basename, parse } = require('path')
const { capitalize } = require('lodash')
const TscWatch = require('tsc-watch/client')

function dirTree(applicationPath, module) {
  const files = []

  const traverse = (path, name = '') => {
    const _path = join(path, name)
    const stat = fs.statSync(_path)
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(_path)) {
        traverse(_path, name)
      }
    } else if (extname(_path) === '.js' && !basename(_path).startsWith('.')) {
      files.push(_path.replace(applicationPath + sep, ''))
    }
  }

  traverse(applicationPath)

  const tree = {}
  let last = tree

  for (const file of files) {
    const { dir, name } = parse(file)

    const parts = dir ? dir.split(sep) : []
    parts.push(name)

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      last[part] = last[part] ?? {}

      if (i + 1 === parts.length) {
        const dtoPath = join(applicationPath, file)
          .replace(applicationPath, './' + join(module))
          .replace('.js', '')
        last[part] =
          typeof last[part] === 'object' && Object.keys(last[part]).length
            ? { _: dtoPath, ...last[part] }
            : dtoPath
      } else {
        last = last[part]
      }
    }

    last = tree
  }

  return tree
}

function getIndex(applicationPath) {
  const modules = ['config', 'lib', 'services']

  const interfaces = []
  const imports = {}

  const addImport = (path) => {
    const alias = path.substring(2).split(sep).join('_')
    imports[alias] = path
    return alias
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
          res += `${key}: ${concatenate(val)}\n`
        }

        res += '}\n'

        return res
      } else {
        return `typeof ${addImport(value)}`
      }
    }

    for (const [key, value] of Object.entries(tree)) {
      interfaceContent += `
          ${key}: ${concatenate(value)}\n
        `
    }

    interfaceContent += '}\n'
    interfaces.push(interfaceContent)
  }

  const importsContent = Object.entries(imports)
    .map(([alias, path]) => `import ${alias} from '${path}'`)
    .join('\n')

  const fileContent = `/// <reference types="neemata" />
${importsContent}

declare global {
${interfaces.join('')}
}`

  return fileContent
}

function genTypings(cwd, isDev) {
  const watch = new TscWatch()
  const outputDir = join(cwd, '.neemata')
  const outputTypesDir = join(outputDir, 'types')

  function compile() {
    fs.writeFileSync(
      join(outputTypesDir, 'index.d.ts'),
      getIndex(join(cwd, 'application')),
      { flag: 'w' }
    )
  }

  watch.on('first_success', () => {
    if (!isDev) {
      compile()
      watch.kill()
    }
  })

  watch.on('success', compile)
  watch.on('error', (...args) => {
    console.dir(args)
  })

  if (!fs.statSync(outputDir).isDirectory()) fs.mkdirSync(outputDir)

  fs.writeFileSync(
    join(outputDir, 'tsconfig.json'),
    JSON.stringify(
      {
        compilerOptions: {
          module: 'commonjs',
          moduleResolution: 'node',
          allowJs: true,
          declaration: true,
          emitDeclarationOnly: true,
          declarationMap: true,
          noEmit: false,
          alwaysStrict: true,
          baseUrl: '.',
          outDir: './types',
          rootDir: '../application',
        },
        include: ['../types/global.d.ts', '../application/**/*.js'],
        exclude: ['../application/db', '../application/api'],
      },
      null,
      2
    )
  )

  watch.start(...['--silent', '--project', join(outputDir, 'tsconfig.json')])
}

module.exports = {
  genTypings,
}
