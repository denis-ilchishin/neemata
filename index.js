const { Neemata } = require('./lib/neemata')
const { timeout } = require('./lib/utils/helpers')

let neemata

const exit = async (code = 0) => {
  if (neemata) await timeout(neemata.shutdown(), 10000, null)
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

process.on('SIGTERM', exit)
process.on('SIGINT', exit)

module.exports = { run }
