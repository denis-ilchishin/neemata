const { execSync } = require('node:child_process')
const { readdirSync, readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const baseDir = 'packages'
const dirs = readdirSync(resolve(baseDir))
const opts = { stdio: 'ignore' }
for (const dirName of dirs) {
  if (dirName.startsWith('.')) continue
  const packagePath = resolve(baseDir, dirName)
  const { version, name } = require(resolve(packagePath, 'package.json'))
  const packName = name
    .split('/')
    .map((v) => v.replace('@', ''))
    .join('-')
  const tarball = `${packName}-${version}.tgz`
  const renameTo = `${packName}.tgz`
  execSync(
    `cd ${packagePath} && pnpm pack && mv -f ${tarball} ${renameTo}`,
    opts
  )
}
