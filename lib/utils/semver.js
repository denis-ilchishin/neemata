const parse = (ver) => ver.split('.').filter((v) => v)

const satisfy = (version, request) => {
  if (request === '*') return true

  version = parse(version).map((v) => parseInt(v))
  request = parse(request)

  if (
    request
      .filter((v) => v !== '*')
      .map((v) => parseInt(v))
      .findIndex((v) => Number.isNaN(v)) !== -1
  )
    return false

  for (let i = 0; i < Math.min(version.length, request.length); i++) {
    const v = version[i]
    let r = request[i]

    if (r === '*') return true
    r = parseInt(r)
    if (v > r) return false
    else if (r > v) return true
  }

  return request.length >= version.length
}

module.exports = { satisfy }
