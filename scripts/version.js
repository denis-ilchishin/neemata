const { readdirSync, writeFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { parseArgs } = require('node:util')
const { valid } = require('semver')

const {
  positionals: [version],
} = parseArgs({
  allowPositionals: true,
  strict: true,
})

if (!valid(version)) {
  console.error('Invalid version')
  process.exit(1)
}

const dirs = [
  resolve('.'),
  ...readdirSync(resolve('packages')).map((pkg) => resolve('packages', pkg)),
]

for (const dir of dirs) {
  const path = resolve(dir, 'package.json')
  const pkg = require(path)
  if (pkg.private) continue
  pkg.version = version
  writeFileSync(path, JSON.stringify(pkg, null, 2))
}
