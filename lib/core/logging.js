// /*
// assert(condition?: boolean, ...data: any[]): void;
// clear(): void;
// count(label?: string): void;
// countReset(label?: string): void;
// debug(...data: any[]): void;
// dir(item?: any, options?: any): void;
// dirxml(...data: any[]): void;
// error(...data: any[]): void;
// group(...data: any[]): void;
// groupCollapsed(...data: any[]): void;
// groupEnd(): void;
// info(...data: any[]): void;
// log(...data: any[]): void;
// table(tabularData?: any, properties?: string[]): void;
// time(label?: string): void;
// timeEnd(label?: string): void;
// timeLog(label?: string, ...data: any[]): void;
// timeStamp(label?: string): void;
// trace(...data: any[]): void;
// warn(...data: any[]): void;

// */
// const { Writable } = require('stream')

// const { Console } = require('console')

// class _consoleStream extends Writable {
//   write(chunk) {
//     this.emit('write', chunk)
//   }
// }

// const stream = new _consoleStream()

// stream.on('open', () => console.log('open'))
// stream.on('drain', () => console.log('drain'))
// stream.on('error', () => console.log('error'))
// stream.on('finish', () => console.log('finish'))
// stream.on('pipe', () => console.log('pipe'))
// stream.on('unpipe', () => console.log('unpipe'))
// stream.on('write', (chunk) => {
//   process.stdout.write(chunk)
// })

// // stream.write('asdasd')
// // stream.pipe()

// const _console = new Console({
//   stdout: stream,
//   // inspectOptions: {
//   //   // customInspect,
//   // },
// })

// _console.dir({ a: '123' })

// // class Logging {
// //   console = _console
// // }
