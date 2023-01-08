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

const dirs = [
  resolve('.'),
  ...readdirSync(resolve('packages')).map((pkg) => resolve('packages', pkg)),
]

for (const dir of dirs) {
  const path = resolve(dir, 'package.json')
  const pkg = require(path)
  if (!pkg.version) continue
  const parsed = semver.parse(pkg.version)
  parsed.inc(command)
  pkg.version = parsed.version
  writeFileSync(path, JSON.stringify(pkg, null, 2))
}
