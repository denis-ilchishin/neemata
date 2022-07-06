# Neemata
Lightweight application server for nodejs, that uses threads under the hood for scaling. Suitable for rapid development, with isolated `vm` contexts and protocol-agnostic API. 

***

### List of features
1. Vertical scailing using `worker_threads`
2. Support of HTTP and WebSockets protocols
3. Scheduler
4. I/O intensive delayed task execution on separate threads
5. Hot reloading

### Core dependencies
- [Fastify](https://github.com/fastify/fastify) - server
- [WS](https://github.com/websockets/ws) - websocket protocol realization 
- [Redis](https://github.com/redis/node-redis) - cache and ws event propagation 
- [Joi](https://github.com/sideway/joi) - data schema validation

### Roadmap
- [ ] Static serving
- [ ] File upload
- [ ] Logging
- [ ] Utils for automation testing
- [ ] Extended typing support

### Examples
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
  guards: [lib.dashboard.guard, async ({auth}) => auth.group === 'ADMIN'],
  schema: Joi.object({ 
      name: Joi.string().required()
  }).required(),
  handler: async ({ auth, data }) => {
      data.name //  validated against schema specified above
  }
})
```
