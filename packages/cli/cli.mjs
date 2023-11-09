import dotenv from 'dotenv'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  strict: false,
  options: {
    applicationPath: {
      type: 'string',
    },
    env: {
      type: 'string',
    },
  },
})

let { env, applicationPath, kwargs } = values

if (env) {
  const { error } = dotenv.config({ path: resolve(env) })
  if (error) throw error
}

applicationPath = resolve(
  applicationPath || process.env.NEEMATA_APPLICATION_PATH
)

const args = positionals

const application = await import(applicationPath).then(
  (module) => module.default
)

export { application, args, kwargs }
