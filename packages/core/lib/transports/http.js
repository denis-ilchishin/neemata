const { Transport, ErrorCode } = require('.@neemata/common')
const { ApiException } = require('../exceptions')

/**
 *
 * @param {import('../server').Server} server
 */
module.exports = function (server) {
  const { fastify, application } = server

  fastify.register(async function (fastify) {
    fastify.route({
      method: 'POST',
      url: application.config.api.baseUrl + '/*',
      handler: async (req, res) => {
        const url = req.url.slice(application.config.api.baseUrl.length + 1)
        const version = req.headers['accept-version'] ?? '*'
        const module = application.modules.api.get(url, Transport.Http, version)

        res.code(200)

        try {
          let data

          if (!module) {
            throw new ApiException({
              code: ErrorCode.NotFound,
              message: 'Not found',
            })
          }

          const auth = await server.handleAuth(req.headers.authorization)

          if (module.auth !== false && !auth) {
            throw new ApiException({
              code: ErrorCode.Unauthorized,
              message: 'Unauthorized',
            })
          }

          if (module.guards) {
            await server.handleGuards(module.guards, { auth, req })
          }

          if (module.schema) {
            data = await server.handleSchema(module.schema, req.body)
          }

          application.runHooks('request', true, {
            auth,
            data,
            req,
            module: { name: module.name, version: module.version },
          })

          const result = await server.handleApi(
            module.handler,
            module.timeout,
            {
              data,
              auth,
              req,
              res,
            }
          )

          res.send(server.makeResponse({ data: result }))
        } catch (err) {
          if (err instanceof ApiException) {
            const { code, data, message } = err
            res.send(server.makeError({ code, data, message }))
          } else {
            application.console.error(err, 'HTTP')
            res.send(
              server.makeError({
                code: ErrorCode.InternalServerError,
                message: 'Internal server error',
              })
            )
          }
        }
      },
    })
  })
}
