const { readdirSync, writeFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { parseArgs } = require('node:util')
const semver = require('semver')

const commands = [
  'major',
  'premajor',
  'minor',
  'preminor',
  'patch',
  'prepatch',
  'prerelease',
]

const {
  positionals: [command],
} = parseArgs({
  allowPositionals: true,
  strict: true,
})

if (!commands.includes(command)) {
  throw new Error(`Available commands: ${commands}`)
}

const dirs = ['.', ...readdirSync(resolve('packages'))]

for (const dirName of dirs) {
  const isRoot = dirName === '.'
  if (!isRoot && dirName.startsWith('.')) continue
  const dir = isRoot ? resolve('.') : resolve('packages', dirName)
  const path = resolve(dir, 'package.json')
  const pkg = require(path)
  if (!pkg.version) continue
  const parsed = semver.parse(pkg.version)
  parsed.inc(command)
  pkg.version = parsed.version
  writeFileSync(path, JSON.stringify(pkg, null, 2))
}
