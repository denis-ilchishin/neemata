## Neemata

Lightweight Node.js RPC application server

[Example](https://github.com/denis-ilchishin/neemata-starter)

### Features:

- Modular and extendable transport-agnostic design
- Dependency injection
- [Application server mode](https://github.com/denis-ilchishin/neemata/pull/41) to run multiple instances of application with worker_threads under one process
- Task workers over worker_threads to parallelize CPU-intensive workloads from API workers
- CLI support

#### First-party adapters and clients:

- **[μWebSockets](https://github.com/uNetworking/uWebSockets.js)** with both websockets and http transports support, as well as binary data streaming over websockets
- **[RabbitMQ](https://www.rabbitmq.com/)**


#### First-party extensions:
- Procedure guards
- Procedure timeout
- Procedure throttling/queues
