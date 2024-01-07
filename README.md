## Neemata
Node.js RPC application server (**POF**)

[Example](https://github.com/denis-ilchishin/neemata-starter)

[Roadmap](https://github.com/denis-ilchishin/neemata/discussions/49)

### Features:

- Modular and extendable [transport-agnostic design](https://github.com/denis-ilchishin/neemata/issues/55)
- Dependency injection
- [Application server mode](https://github.com/denis-ilchishin/neemata/pull/41) to run multiple instances of application API with worker_threads under one process
- Task workers over worker_threads to parallelize CPU-intensive workloads and prevent blocking of API workers 
- [Transport-agnostic data streaming](https://github.com/denis-ilchishin/neemata/issues/56)
- CLI support
- Typescript modules support without build process (runtime transpilation with [SWC](https://github.com/swc-project/swc))
- Hot-reload without server restart (preserving all current connections)
- Static end-to-end typesafety for fullstack TS apps, including server events and streams

#### First-party transports and clients:
- **HTTP**
- **Websockets**
- **AMQP**

#### First-party extensions:
- JSON schema generation
- Cron
