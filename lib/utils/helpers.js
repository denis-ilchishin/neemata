function range(end, start = 0) {
  let current = start
  return {
    [Symbol.iterator]() {
      return {
        next() {
          if (current <= end) {
            return { done: false, value: current++ }
          } else {
            return { done: true, value: current }
          }
        },
      }
    },
    toArray() {
      return Array.from(this)
    },
  }
}

async function timeout(
  promise,
  time,
  err = new Error(`Timeout of ${time} ms`)
) {
  return Promise.race([
    promise,
    new Promise((res, rej) =>
      setTimeout(() => {
        err ? rej(err) : res()
      }, time)
    ),
  ])
}

module.exports = {
  timeout,
  range,
}
