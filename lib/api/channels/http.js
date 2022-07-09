const { HttpStatus } = require('../../enums/http-status')
const { ErrorCode } = require('../../enums/error-code')
const { Channel } = require('../channel')
const { Protocol } = require('../../enums/protocol')
const { ApiException } = require('../exception')

class HttpChannel extends Channel {
  resolveAuth(req) {
    const [type, token] = (req.headers.authorization ?? '').split(' ')
    if (type === 'Token' && token) return token
    else return null
  }

  bind() {
    this.fastify.post(
      this.application.appConfig.api.baseUrl + '/*',
      async (req, res) => {
        const version = req.headers['accept-version'] ?? '*'
        const apiModule = this.application.api.get(
          req.url.slice(5),
          Protocol.Http,
          version
        )

        res.code(HttpStatus.OK)

        try {
          if (!apiModule)
            throw new ApiException({
              code: ErrorCode.NotFound,
              message: 'Not found',
            })

          const auth = await this.handleAuth(this.resolveAuth(req))

          if (apiModule.auth && !auth) {
            throw new ApiException({
              code: ErrorCode.Unauthorized,
              message: 'Unauthorized request',
            })
          }

          if (apiModule.guards) {
            await this.handleGuards(apiModule.guards, { auth, req })
          }

          const data = apiModule.schema
            ? await this.handlerSchema(apiModule.schema, req.body)
            : req.body

          const result = await this.handleApi(apiModule.handler, {
            data,
            auth,
            req,
          })
          res.send(this.makeResponse({ data: result }))
        } catch (error) {
          if (error instanceof ApiException) {
            const { code, data, message } = error
            res.send(this.makeError({ code, data, message }))
          } else {
            this.application.console.error(error)
            res.send(
              this.makeError({
                code: ErrorCode.InternalServerError,
                message: 'Internal server error',
              })
            )
          }
        }
      }
    )
  }
}

module.exports = { HttpChannel }
