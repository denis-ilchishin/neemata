const { Neemata } = require('./lib/neemata')
const { timeout } = require('./lib/utils/helpers')

let neemata
let exiting

const exit = async (code = 0) => {
  if (exiting) return
  exiting = true
  if (neemata)
    await timeout(
      neemata.shutdown(),
      neemata.appConfig.timeouts.app.shutdown + 1000,
      null
    )
  process.exit(code)
}

const logErr = (err) => {
  console.error(err)
  exit(1)
}

async function run() {
  try {
    neemata = new Neemata()
    await neemata.startup()
  } catch (err) {
    logErr(err)
  }
}

async function exec(task, args) {
  try {
    neemata = new Neemata()
    await neemata.exec(task, args)
    exit()
  } catch (err) {
    logErr(err)
  }
}

process.on('SIGTERM', exit)
process.on('SIGINT', exit)

module.exports = { run, exec }
