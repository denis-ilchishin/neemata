# Neemata
Lightweight application server for nodejs, that uses `node:worker_threads` and `node:vm` contexts under the hood for scaling and isolation. Suitable for rapid development using protocol-agnostic API. 

***

### List of features
1. Vertical scailing using `worker_threads`
2. Support of HTTP and WebSockets protocols. With protocol-agnostic design, on client side just use `await neemata.api.findUser(id)` no matter of http or ws protocol being used.
3. Task scheduler
4. I/O intensive delayed task execution on separate threads
5. On-fly instant hot reloading, without process/worker restart

### Core dependencies
- [Fastify](https://github.com/fastify/fastify) - web server
- [WS](https://github.com/websockets/ws) - websocket protocol 
- [Redis](https://github.com/redis/node-redis) - (optional) cache and events propagation between processes and threads
- ~~[Joi](https://github.com/sideway/joi) - data schema validation~~
- [Zod](https://github.com/colinhacks/zod) - data schema validation

### Roadmap
- [X] [Starter project](https://github.com/denis-ilchishin/neemata-starter) 
- [ ] ~~Web socket rooms~~ 
- [X] Binary data handling (over http only for now)
- [X] Logging
- [ ] CLI support
- [X] Optimize client API
- [ ] Extended configuration
- [ ] Get rid of all non-core dependecies
- [ ] Utils for automation testing
- [ ] Documentation
- [ ] Publish to npm

Additional:
- [ ] *Safe and configurable* `require` 
- [ ] Request queues and *maybe?* throttling 
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
