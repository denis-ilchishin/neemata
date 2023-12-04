## Neemata

Lightweight Node.js RPC-like application server

[Example](https://github.com/denis-ilchishin/neemata-starter)

### Features:

- Modular and extendable transport-agnostic design
- Dependency injection
- (In progress) [Application server mode](https://github.com/denis-ilchishin/neemata/pull/41) to run multiple instances of application with worker_threads 

#### First-party adapters and clients:

- **[μWebSockets](https://github.com/uNetworking/uWebSockets.js)** with both websockets and http transports support, and binary data streaming over websockets
- **[RabbitMQ](https://www.rabbitmq.com/)**

#### First-party extensions:

- ~~Task runner over worker threads with worker pool and in progress abort signals, as well as cli support~~ See [application server PR](https://github.com/denis-ilchishin/neemata/pull/41): 
- Procedure guards
- Procedure timeout
- Procedure throttling/queues
