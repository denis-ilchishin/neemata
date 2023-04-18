const { UserApplication } = require('./lib/application')
const { ApiException } = require('./lib/protocol/exceptions')

async function start({
  command,
  args,
  configPath,
  rootPath,
  scheduler,
  timeout,
}) {
  const { Config } = require('./lib/config')
  const { ConsoleLogger } = require('./lib/console')
  const { Neemata } = require('./lib/neemata')

  const commands = ['dev', 'prod', 'task']
  if (!commands.includes(command)) throw new Error('Invalid command')

  const isProd = command === 'prod'
  const isDev = command === 'dev'
  const isOneOff = command === 'task'

  const config = new Config(configPath)
  globalThis.logger = new ConsoleLogger(config.resolved.log.level, 'Neemata')
  const neemata = new Neemata({
    config,
    isDev,
    isProd,
    rootPath,
    scheduler,
  })

  const logErr = (err) => {
    console.error(err)
    exit(1)
  }

  let exiting = 0

  const exit = async (code = 0) => {
    if (exiting) {
      // force exit
      // timeout is needeed to skip npm firing sigint twice
      if (exiting <= Date.now() - 100) process.exit(1)
      else return
    }

    // start gracefull shutdown
    exiting = Date.now()

    const timeout = neemata.config?.resolved?.timeouts.shutdown
    await Promise.race([
      neemata.shutdown(),
      new Promise((r) => setTimeout(r, timeout ? timeout + 1000 : 5000)),
    ])

    process.exit(code)
  }

  try {
    if (isOneOff) {
      const [task, ...taskArgs] = args
      await neemata.run(
        task,
        timeout,
        ...taskArgs.map((v) => JSON.parse(v)) // TODO: json probably not really good format to pass args via command-line?
      )
    } else {
      await neemata.startup()
    }
  } catch (error) {
    logErr(error)
  }

  process.on('SIGTERM', exit)
  process.on('SIGINT', exit)
}

module.exports = { start, UserApplication, ApiException }
