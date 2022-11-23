const { readdirSync, writeFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { parseArgs } = require('node:util')
const { valid } = require('semver')

const {
  values: { version },
} = parseArgs({
  options: {
    version: { type: 'string', short: 'v' },
  },
  allowPositionals: false,
  strict: true,
})

if (!valid(version)) {
  console.error('Invalid version')
  process.exit(1)
}

const dirs = [
  resolve('.'),
  ...readdirSync(resolve('packages')).map((package) =>
    resolve('packages', package)
  ),
]

for (const dir of dirs) {
  const path = resolve(dir, 'package.json')
  const pkg = require(path)
  if (pkg.private) continue
  pkg.version = version
  writeFileSync(path, JSON.stringify(pkg, null, 2))
}
