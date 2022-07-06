# Neemata
Lightweight application server for nodejs, that uses threads under the hood for scaling. Suitable for rapid development, with isolated `vm` contexts and protocol-agnostic API. 

***

### List of features
1. Vertical scailing using `worker_threads`
2. Support of HTTP and WebSockets protocols. With protocol-agnostic design, on client side just use `await neemata.api.findUser(id)` no matter of http or ws.
3. Scheduler
4. I/O intensive delayed task execution on separate threads
5. On-fly instant hot reloading, without process/worker restart

### Core dependencies
- [Fastify](https://github.com/fastify/fastify) - server
- [WS](https://github.com/websockets/ws) - websocket protocol realization 
- [Redis](https://github.com/redis/node-redis) - cache and ws event propagation 
- [Joi](https://github.com/sideway/joi) - data schema validation

### Roadmap
- [X] [Starter project](https://github.com/denis-ilchishin/neemata-starter) 
- [ ] Web socket rooms
- [ ] *Safe* `require` for better security
- [ ] Static serving
- [ ] File upload
- [ ] Logging
- [ ] Utils for automation testing
- [ ] Extended configuration
- [ ] Extended typing support
- [ ] Get rid of all non-core dependecies
- [ ] Documentation

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
