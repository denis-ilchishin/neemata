import {
  BaseExtension,
  BinaryStream,
  ExtensionInstallOptions,
  Hook,
  JsonStream,
  ProcedureDataType,
  ProcedureDeclaration,
  WorkerType,
} from '@neemata/application'
import { BaseClientStream } from '@neemata/common'
import { writeFile } from 'node:fs/promises'
import { dirname, relative } from 'node:path'
import { name as packageName } from '../package.json'

export class StaticApiAnnotations extends BaseExtension {
  name = 'Static API annotations'

  application!: ExtensionInstallOptions<{}, {}>

  constructor(private readonly options: { output: string }) {
    super()
  }

  install(application: ExtensionInstallOptions<{}, {}>) {
    this.application = application

    const { type, api, registerHook, registerCommand } = application

    registerCommand('generate', async () => {
      if (type !== WorkerType.Api) await api.load()
      await this.generate()
    })

    if (type === WorkerType.Api)
      registerHook(Hook.AfterInitialize, this.generate.bind(this))
  }

  private async generate() {
    const procedures: any = []
    for (const [name, filePath] of this.application.api.paths) {
      const path = relative(dirname(this.options.output), filePath)
      procedures.push(`"${name}": typeof import("${path}").default`)
    }
    const entries = `\n  ${procedures.join(',\n  ')}\n`
    const dtsContent = `export declare type Api = import("${packageName}").ResolveApi<{${entries}}>`
    await writeFile(this.options.output, dtsContent)
  }
}

export type ResolveApi<Input extends Record<string, any>> = {
  [K in keyof Input as Input[K] extends ProcedureDeclaration<
    any,
    any,
    any,
    any,
    any,
    any,
    any
  >
    ? K
    : never]: Input[K] extends ProcedureDeclaration<
    any,
    any,
    any,
    any,
    infer Input,
    infer Response,
    infer Output
  >
    ? {
        input: ProcedureDataType<Input>
        output: ResolveApiOutput<
          Awaited<Output extends unknown ? Response : ProcedureDataType<Output>>
        >
      }
    : never
}

export type ResolveApiOutput<Output> = Output extends JsonStream<infer Type>
  ? BaseClientStream<Primitive<Type>>
  : Output extends BinaryStream
  ? BaseClientStream<Uint8Array>
  : Primitive<Output>

/**
 * Slightly modified version of https://github.com/samchon/typia Primitive type.
 * Excludes keys with `never` types from object, and if a function is in array,
 * then it is stringified as `null`, just like JSON.stringify does.
 */
export type Primitive<T> = Equal<T, PrimitiveMain<T>> extends true
  ? T
  : PrimitiveMain<T>

type Equal<X, Y> = X extends Y ? (Y extends X ? true : false) : false

type PrimitiveMain<
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
    : PrimitiveMain<T, true>[]
  : {
      [P in keyof Instance as PrimitiveMain<Instance[P]> extends never
        ? never
        : P]: PrimitiveMain<Instance[P]>
    }

type PrimitiveTuple<T extends readonly any[]> = T extends []
  ? []
  : T extends [infer F]
  ? [PrimitiveMain<F, true>]
  : T extends [infer F, ...infer Rest extends readonly any[]]
  ? [PrimitiveMain<F, true>, ...PrimitiveTuple<Rest>]
  : T extends [(infer F)?]
  ? [PrimitiveMain<F, true>?]
  : T extends [(infer F)?, ...infer Rest extends readonly any[]]
  ? [PrimitiveMain<F, true>?, ...PrimitiveTuple<Rest>]
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
