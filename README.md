## Neemata

Lightweight Node.js RPC application server

[Example](https://github.com/denis-ilchishin/neemata-starter)

[Roadmap](https://github.com/denis-ilchishin/neemata/discussions/49)

### Features:

- Modular and extendable [transport-agnostic](https://github.com/denis-ilchishin/neemata/issues/55) design
- Dependency injection
- [Application server mode](https://github.com/denis-ilchishin/neemata/pull/41) to run multiple instances of application with worker_threads under one process
- Task workers over worker_threads to parallelize CPU-intensive workloads and prevent blocking of API workers 
- Bi-directional [transport-agnostic](https://github.com/denis-ilchishin/neemata/issues/56) data streaming
- CLI support
- Typescript modules support without build process (runtime transpilation with [SWC](https://github.com/swc-project/swc))
- Hot-reload without server restart (preserving all current connections)

#### First-party transports and clients:
- **HTTP**
- **Websockets**
- **AMQP**


#### First-party extensions:
- Procedure guards
- Procedure timeout
- Procedure throttling/queues
