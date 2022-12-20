# Neemata

Lightweight application server for nodejs, that uses `node:worker_threads` and `node:vm` contexts under the hood for scaling and isolation. Suitable for rapid development using protocol-agnostic API.

---

### List of features

1. Vertical scaling using `worker_threads`
2. Protocol-agnostic design: support for `http` and `ws` protocols
3. Task scheduler
4. Delayed task execution using thread pool
5. On-fly instant hot reloading, without process/worker restart
6. File system routing (with optional versioning)
7. Support for CommonJS and EcmaScript and Typescript modules

### Core dependencies

- [Fastify](https://github.com/fastify/fastify) - web server
- [WS](https://github.com/websockets/ws) - websocket protocol
- [Zod](https://github.com/colinhacks/zod) - data schema validation

### [Roadmap](https://github.com/denis-ilchishin/neemata/issues?q=label%3Aroadmap)

### [Examples](https://github.com/denis-ilchishin/neemata-starter)
