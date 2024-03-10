import type { Readable } from 'node:stream'
import type {
  Subscription as ClientSubscription,
  UpStream,
} from '@neematajs/common'
import type { Api, Procedure } from './api'
import type { Application } from './application'
import type { Container, Provider } from './container'
import type { Event } from './events'
import type { BaseExtension } from './extension'
import type { Logger } from './logger'
import type { Registry } from './registry'
import type { StreamResponse } from './streams'
import type { Subscription as ServerSubscription } from './subscription'
import type { Task, TaskExecution } from './tasks'
import type { BaseTransportConnection } from './transport'

export enum Scope {
  Global = 'Global',
  Connection = 'Connection',
  Call = 'Call',
  Transient = 'Transient',
}

export enum Hook {
  BeforeInitialize = 'BeforeInitialize',
  AfterInitialize = 'AfterInitialize',
  BeforeStart = 'BeforeStart',
  AfterStart = 'AfterStart',
  BeforeStop = 'BeforeStop',
  AfterStop = 'AfterStop',
  BeforeTerminate = 'BeforeTerminate',
  AfterTerminate = 'AfterTerminate',
}

export enum WorkerType {
  Api = 'Api',
  Task = 'Task',
}

export type Callback = (...args: any[]) => any
export type Pattern = RegExp | string | ((value: string) => boolean)
export type OmitFirstItem<T extends any[]> = T extends [any, ...infer U]
  ? U
  : []
export type ErrorClass = new (...args: any[]) => Error
export type Extra = Record<string, any>
export type Async<T> = T | Promise<T>

export type GuardOptions<App extends AnyApplication = AnyApplication> = {
  connection: App['_']['connection']
  path: [Procedure, ...Procedure[]]
}

export type Command = (
  options: {
    args: string[]
    kwargs: Record<string, any>
  },
  ...args: any[]
) => any

export type ConnectionFn<T = any, C = any> = (transportData: T) => Async<C>

export type FilterFn<T extends ErrorClass = ErrorClass> = (
  error: InstanceType<T>,
) => Async<Error>

export type GuardFn<App extends AnyApplication = AnyApplication> = (
  options: GuardOptions<App>,
) => Async<boolean>

export type MiddlewareFn<App extends AnyApplication = AnyApplication> = (
  options: MiddlewareContext<App>,
  next: Next,
  payload: any,
) => any

export type ConnectionProvider<T, C> = Provider<ConnectionFn<T, C>>

export type AnyApplication = Application<any, any, any, any>

export type AnyProvider = Provider<any, any, any>
export type AnyProcedure = Procedure<any, any, any, any>
export type AnyTask = Task<any, any, any>
export type AnyEvent = Event<any, any, any>

export type MiddlewareContext<App extends AnyApplication = AnyApplication> = {
  connection: App['_']['connection']
  path: [Procedure, ...Procedure[]]
  container: Container
  procedure: Procedure
}

export type Next = (payload?: any) => any

export interface HooksInterface {
  [Hook.BeforeInitialize]: () => any
  [Hook.AfterInitialize]: () => any
  [Hook.BeforeStart]: () => any
  [Hook.AfterStart]: () => any
  [Hook.BeforeStop]: () => any
  [Hook.AfterStop]: () => any
  [Hook.BeforeTerminate]: () => any
  [Hook.AfterTerminate]: () => any
}

export type CallHook<T extends string> = (
  hook: T,
  ...args: T extends keyof HooksInterface
    ? Parameters<HooksInterface[T]>
    : any[]
) => Promise<void>

export interface ExtensionApplication {
  type: WorkerType
  api: Api
  container: Container
  logger: Logger
  connections: Map<BaseTransportConnection['id'], BaseTransportConnection>
  registry: Registry
}

export type ResolveExtensionContext<
  Extensions extends Record<string, BaseExtension>,
> = {
  [K in keyof Extensions]: Extensions[K] extends BaseExtension<infer Context>
    ? Context
    : never
}

export type UnionToIntersection<U> = (
  U extends any
    ? (k: U) => void
    : never
) extends (k: infer I) => void
  ? I
  : never

export type InferSchemaOutput<Schema> = Schema extends import('zod').ZodSchema
  ? import('zod').TypeOf<Schema>
  : Schema extends import('@sinclair/typebox').TSchema
    ? import('@sinclair/typebox').Static<Schema>
    : unknown

export type InferSchemaInput<Schema> = Schema extends import('zod').ZodSchema
  ? import('zod').input<Schema>
  : Schema extends import('@sinclair/typebox').TSchema
    ? import('@sinclair/typebox').Static<Schema>
    : unknown

export type Primitive = string | number | boolean | null
export type Scalars = Primitive | Primitive[]

export type GlobalContext = {
  logger: Logger
}

export type CallFn = <P extends Procedure>(
  procedure: P,
  ...args: P['input'] extends unknown ? [] : [InferSchemaOutput<P['input']>]
) => Promise<
  Awaited<
    P['output'] extends unknown
      ? ReturnType<P['handler']>
      : InferSchemaOutput<P['output']>
  >
>

export type ExecuteFn = <T extends Task>(
  task: T,
  ...args: OmitFirstItem<Parameters<T['handler']>>
) => TaskExecution<Awaited<ReturnType<T['handler']>>>

export type Merge<
  T1 extends Record<string, any>,
  T2 extends Record<string, any>,
> = {
  [K in keyof T1 | keyof T2]: K extends keyof T2
    ? T2[K]
    : K extends keyof T1
      ? T1[K]
      : never
}

export type ResolveEvents<Events extends Record<string, Event>> = {
  [K in keyof Events]: Events[K]['_']['payload']
}

export type ResolveProcedures<Procedures extends Record<string, any>> = {
  [K in keyof Procedures]: {
    input: ResolveApiInput<InferSchemaOutput<Procedures[K]['_']['input']>>
    output: ResolveApiOutput<
      Awaited<
        null extends Procedures[K]['_']['output']
          ? ReturnType<Procedures[K]['handler']>
          : InferSchemaOutput<Procedures[K]['_']['output']>
      >
    >
    options: Procedures[K]['_']['options']
  }
}

export type ResolveApiInput<Input> = Input extends Readable
  ? UpStream
  : Input extends object
    ? {
        [K in keyof Input]: ResolveApiInput<Input[K]>
      }
    : Input

export type ResolveApiOutput<Output> = Output extends StreamResponse
  ? {
      payload: JsonPrimitive<Output['payload']>
      stream: import('@neematajs/common').DownStream<
        Output['chunk'] extends ArrayBuffer
          ? ArrayBuffer
          : JsonPrimitive<Output['chunk']>
      >['interface']
    }
  : Output extends ServerSubscription
    ? ClientSubscription<Output['_']['event']['_']['payload']>
    : JsonPrimitive<Output>

/**
 * Slightly modified version of https://github.com/samchon/typia Primitive type. (TODO: make a PR maybe?)
 * Excludes keys with `never` types from object, and if a function is in array,
 * then it is stringified as `null`, just like V8's implementation of JSON.stringify does.
 */
export type JsonPrimitive<T> = Equal<T, JsonPrimitiveMain<T>> extends true
  ? T
  : JsonPrimitiveMain<T>

type Equal<X, Y> = X extends Y ? (Y extends X ? true : false) : false

type JsonPrimitiveMain<
  Instance,
  InArray extends boolean = false,
> = Instance extends [never]
  ? never // (special trick for jsonable | null) type
  : ValueOf<Instance> extends bigint
    ? never
    : ValueOf<Instance> extends boolean | number | string
      ? ValueOf<Instance>
      : Instance extends Function
        ? InArray extends true
          ? null
          : never
        : ValueOf<Instance> extends object
          ? Instance extends object
            ? Instance extends NativeClass
              ? {}
              : Instance extends IJsonable<infer Raw>
                ? ValueOf<Raw> extends object
                  ? Raw extends object
                    ? PrimitiveObject<Raw> // object would be primitified
                    : never // cannot be
                  : ValueOf<Raw> // atomic value
                : PrimitiveObject<Instance> // object would be primitified
            : never // cannot be
          : ValueOf<Instance>

type PrimitiveObject<Instance extends object> = Instance extends Array<infer T>
  ? IsTuple<Instance> extends true
    ? PrimitiveTuple<Instance>
    : JsonPrimitiveMain<T, true>[]
  : {
      [P in keyof Instance as JsonPrimitiveMain<Instance[P]> extends never
        ? never
        : P]: JsonPrimitiveMain<Instance[P]>
    }

type PrimitiveTuple<T extends readonly any[]> = T extends []
  ? []
  : T extends [infer F]
    ? [JsonPrimitiveMain<F, true>]
    : T extends [infer F, ...infer Rest extends readonly any[]]
      ? [JsonPrimitiveMain<F, true>, ...PrimitiveTuple<Rest>]
      : T extends [(infer F)?]
        ? [JsonPrimitiveMain<F, true>?]
        : T extends [(infer F)?, ...infer Rest extends readonly any[]]
          ? [JsonPrimitiveMain<F, true>?, ...PrimitiveTuple<Rest>]
          : []

type ValueOf<Instance> = IsValueOf<Instance, Boolean> extends true
  ? boolean
  : IsValueOf<Instance, Number> extends true
    ? number
    : IsValueOf<Instance, String> extends true
      ? string
      : Instance

type NativeClass =
  | Set<any>
  | Map<any, any>
  | WeakSet<any>
  | WeakMap<any, any>
  | Uint8Array
  | Uint8ClampedArray
  | Uint16Array
  | Uint32Array
  | BigUint64Array
  | Int8Array
  | Int16Array
  | Int32Array
  | BigInt64Array
  | Float32Array
  | Float64Array
  | ArrayBuffer
  | SharedArrayBuffer
  | DataView

type IsTuple<T extends readonly any[] | { length: number }> = [T] extends [
  never,
]
  ? false
  : T extends readonly any[]
    ? number extends T['length']
      ? false
      : true
    : false

type IsValueOf<Instance, Object extends IValueOf<any>> = Instance extends Object
  ? Object extends IValueOf<infer U>
    ? Instance extends U
      ? false
      : true // not Primitive, but Object
    : false // cannot be
  : false

interface IValueOf<T> {
  valueOf(): T
}

interface IJsonable<T> {
  toJSON(): T
}
