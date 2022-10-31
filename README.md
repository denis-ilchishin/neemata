# Neemata

Lightweight application server for nodejs, that uses `node:worker_threads` and `node:vm` contexts under the hood for scaling and isolation. Suitable for rapid development using protocol-agnostic API.

---

### List of features

1. Vertical scailing using `worker_threads`
2. Protocol-agnostic design. On client side just use `await neemata.api.findUser(id)`.
3. Task scheduler
4. I/O intensive delayed task execution on separate threads
5. On-fly instant hot reloading, without process/worker restart

### Core dependencies

- [Fastify](https://github.com/fastify/fastify) - web server
- [WS](https://github.com/websockets/ws) - websocket protocol
- [Zod](https://github.com/colinhacks/zod) - data schema validation

### Roadmap

- [x] [Starter project](https://github.com/denis-ilchishin/neemata-starter)
- [ ] ~~Web socket rooms~~
- [x] Binary data handling (over http only for now)
- [x] Logging
- [x] CLI support
- [x] Optimize client API
- [ ] Extended configuration
- [ ] Get rid of all non-core dependecies
- [ ] Utils for automation testing
- [ ] Documentation
- [ ] Publish to npm

Additional:
- [ ] Common libs, like message brocker and ws rooms 
- [ ] _Safe and configurable_ `require`
- [ ] Request queues and _maybe?_ throttling
- [ ] Static serving
- [ ] Extended typing support

### Examples

More examples [in starter repo](https://github.com/denis-ilchishin/neemata-starter)

```JS
// application/api/someEndpoint.js --> (POST) /api/someEndpoint
module.exports = async ({ data, auth }) => {
   if(auth) {
       await services.createPost({ name: data.name, description: data.text })
   }
}
```

Or for more extended usage

```JS
// application/api/someEndpoint.2.js --> (POST) [v2] /api/someEndpoint
const Zod = require('zod')

module.exports = defineApiModule({
  auth: false, // allow not authenticated requests
  protocol: 'http', // allow only http transport
  guards: [lib.dashboard.guard, ({ auth }) => auth.group === 'ADMIN'], // guards before access endpoint
  schema: Zod.object({
      name: Zod.string()
  }),
  handler: async ({ auth, data }) => {
      return data.name //  validated against schema specified above
  }
})
```
