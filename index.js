const { Neemata } = require('./lib/neemata')
const { timeout } = require('./lib/utils/helpers')

let neemata

const exit = async () => {
  if (neemata) await timeout(neemata.shutdown(), 10000, null)
  process.exit(1)
}

const logErr = (err) => {
  console.error(err)
  exit()
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

module.exports = { run }
