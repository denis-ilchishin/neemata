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
- [Redis](https://github.com/redis/node-redis) - cache and ws events propagation 
- [Joi](https://github.com/sideway/joi) - data schema validation

### Roadmap
- [X] [Starter project](https://github.com/denis-ilchishin/neemata-starter) 
- [ ] ~~Web socket rooms~~
- [ ] *Safe and configurable* `require` 
- [ ] Binary data handling
- [ ] Request queues and *maybe?* throttling 
- [ ] Static serving
- [ ] Logging
- [ ] Optimize client API, to support SSR
- [ ] Utils for automation testing
- [ ] Extended configuration
- [ ] Extended typing support
- [ ] Get rid of all non-core dependecies
- [ ] Documentation
- [ ] Publish to npm

### Examples

More examples [in starter repo](https://github.com/denis-ilchishin/neemata-starter) 

```JS
module.exports = async ({ data, auth }) => {
   if(auth) {
       await services.createPost({ name: data.name, description: data.text })
   } 
}
```
Or for more extended usage
```JS
const Joi = require('joi')

module.exports = defineApiModule({
  auth: true,
  protocol: 'http',
  guards: [lib.dashboard.guard, async ({ auth }) => auth.group === 'ADMIN'],
  schema: Joi.object({ 
      name: Joi.string().required()
  }).required(),
  handler: async ({ auth, data }) => {
      return data.name //  validated against schema specified above
  }
})
```
