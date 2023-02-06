# Neemata

Lightweight application server for nodejs, that uses `node:worker_threads` and `node:vm` contexts under the hood for scaling and isolation. Suitable for rapid development using protocol-agnostic approach.

**_Not ready for use in production, and should only be considered as proof of concept. API and core logic will almost certainly undergo significant changes._**

---

### List of features

1. Vertical scaling using `worker_threads`
2. Protocol-agnostic design: `http` and `ws` protocols
3. Task scheduler
4. Delayed task execution using thread pool
5. On-fly instant hot reloading, without process/worker restart
6. File system routing (with optional versioning)
7. Support for CommonJS, EcmaScript and Typescript modules
8. Binary data streaming

### Core dependencies

- [WS](https://github.com/websockets/ws) - websocket protocol
- [Typebox](https://github.com/sinclairzx81/typebox)/[Zod](https://github.com/colinhacks/zod) - input data validation

### [Roadmap](https://github.com/denis-ilchishin/neemata/issues?q=label%3Aroadmap)

---

### [Examples](https://github.com/denis-ilchishin/neemata-starter)

---

### Background and personal experience

You've might heard of [Nest framework](https://github.com/nestjs/nest), and for me Nest is like a pearl in the sea of Node frameworks. Arguably, it is one of the best frameworks for Node. But in practice, "best" could vary in different situations.

Nest is well designed, also it uses best approaches and paradigms in software development world. But there's also a price. When you actually use Nest in your projects, quite quickly you end up with enormous amount of code, files and other boilerplate stuff. Project's codebase grows so quickly, that it becomes really difficult to maintain and develop further features. 70-80% of that code is just "useless" imports, exports, dependecy injections, etc, that bear no valuable business meaning. So, in the result you need so spend a lot resources (time/money) to maintain and keep developing new features. So, in my personal opinion, Nest is more suitable for project with larger budgets, when you can handle these disadvantages, and utilize all of it's advantages.

I've been working on some projects, but all of those were low-budget projects, just with couple of devs at best. And Nest ended up being quite time consuming for the things that not generating revenue. And that is critical when you have no extra resources to cover that. Initially, the idea of this library was to try to find some faster and easier way to develop backends and APIs, especially when you don't have plenty of resources for managing complex solutions, microservices, etc, but still do not sacrifice a lot in terms of flexability, usage of new technologies and control over your application.

I tried to distinguish some most common aspects of the kind of projects I worked on:

1. It should be a monolith application, since there're not enough developers and expertise to design and maintain complex distributed application architectures.
2. They all have some common requirements regarding business logic and related technical features (at least partially):
   - being able to serve to hundreds-thousands of users simultaneously
   - simple API with bunch of different endpoints, cruds, maybe some endpoints to aggregate some data
   - uploading media, generating thumbnails for images
   - several cron jobs to run some logic, something like count comments, reviews, etc, which requires to much time/resources to do it each request
   - necessity of simple bi-directional communications with clients, for "real-time" simple chats, notifications, etc
   - run some dedicated tasks separately from main API threads for some more CPU intensive tasks
   - incomming data validation and response serialization
3. Even tho it's not an enterprise level, it still need to be performant. Also, it should be easy scalable to some degree without complex approaches, since there are no budget for that (at least yet). Most of this kind of applications shouldn't "grow" to the degree that couldn't be handled by one machine/server, therefore we can avoid complex deploy management systems like Kubernetes. So, it'd be very good to have a way for horizontal scaling from the box.
4. Has to be secure enough

But also, there some things that I personally as a developer would like to have for better DX (completely subjective):

- I don't really like Typescript, but I like type annotations. So, I'd like to have a way to have typings, but avoid Typescript limitations, and run code without pain, even if Typescript complains on something, which in most of the cases is actually a valid Javascript code. Also, I don't want to have a headache with tsconfig and other stuff like that. Just write and run approach. (Exited about [type annotations proposal](https://github.com/tc39/proposal-type-annotations))
- I don't like decorators, at least the way they work in TS. That is a pain for me in Nest. Don't know what's gonna happen when native decorators finally land to official js specification
- I'd like to have some easy way to interact with the API in easy way on client-side
- I'd like to be able to run any "version" of javascript (es, cjs, ts) without pain
- I'd like to write less "meaningless" boilerplate code. Writing 500 lines of code, 10 files and classes, just to create single simple endpoint is too much (hello Nest again)

Feel free to start new [discussions](https://github.com/denis-ilchishin/neemata/discussions)
