import {
  AnyApplication,
  BaseExtension,
  Hook,
  InferSchema,
  Procedure,
  StreamResponse,
} from '@neemata/application'
import { UpStream } from '@neemata/common'
import { writeFile } from 'node:fs/promises'
import { dirname, relative } from 'node:path'
import { Readable } from 'node:stream'
import { name as packageName } from '../package.json'

export class StaticApiAnnotations extends BaseExtension {
  name = 'Static API annotations'

  constructor(
    private readonly options: {
      output: string
      emit: boolean
      applicationPath: string
    }
  ) {
    super()
  }

  initialize() {
    const { registerHook, registerCommand } = this.application
    registerCommand('emit', () => this.emit())
    if (this.options.emit !== false) {
      registerHook(Hook.AfterInitialize, this.emit.bind(this))
    }
  }

  private async emit() {
    const procedures: any = []
    for (const [name, filePath] of this.application.api.paths) {
      const path = relative(dirname(this.options.output), filePath)
      procedures.push(`"${name}": typeof import("${path}").default`)
    }
    const appRelativePath = relative(
      dirname(this.options.output),
      this.options.applicationPath
    )
    const entries = `\n  ${procedures.join(',\n  ')}\n`
    const dtsContent = `export declare type Procedures = import("${packageName}").ResolveProcedures<{${entries}}>;\nexport declare type Events = import("${packageName}").ResolveEvents<typeof import("${appRelativePath}").default>`
    await writeFile(this.options.output, dtsContent)
  }
}

export type ResolveEvents<App extends AnyApplication> = {
  [K in keyof App['_']['events']]: App['_']['events'][K]['payload']
}

export type ResolveProcedures<Api extends Record<string, any>> = {
  [K in keyof Api as Api[K] extends Procedure
    ? K
    : never]: Api[K] extends Procedure
    ? {
        input: ResolveApiInput<InferSchema<Api>>
        output: ResolveApiOutput<
          Awaited<
            Api[K]['_']['output'] extends unknown
              ? ReturnType<Api[K]['handler']>
              : InferSchema<Api[K]['_']['output']>
          >
        >
      }
    : never
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
      stream: import('@neemata/common').DownStream<
        Output['chunk'] extends ArrayBuffer
          ? ArrayBuffer
          : JsonPrimitive<Output['chunk']>
      >['interface']
    }
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
  InArray extends boolean = false
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
  never
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
