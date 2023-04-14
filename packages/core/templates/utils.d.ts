type Replace<T, From, To> = T extends (...args: any[]) => any
  ? T
  : {
      [K in keyof T]: [T[K], From] extends [From, T[K]]
        ? To
        : Replace<T[K], From, To>
    }

type ApiCall<
  T extends import('@neemata/core/types/external').Procedure<any, any, any, any>
> = (
  data: Replace<
    Parameters<T['handler']>[0]['data'],
    Stream,
    import('@neemata/client').Stream
  >
) => Promise<Awaited<ReturnType<T['handler']>>>

type Merge<T, T2> = {
  [K in keyof T | keyof T2]: K extends keyof T2
    ? T2[K] extends symbol | number | string | boolean | undefined | null
      ? K extends keyof T
        ? T[K]
        : never
      : T2[K]
    : K extends keyof T
    ? T[K]
    : never
}

type IsEmpty<T> = keyof T extends never ? true : false
type Resolve<T> = IsEmpty<T> extends false
  ? 'default' extends keyof T
    ? T['default'] & Pick<T, Exclude<keyof T, 'default'>>
    : T
  : unknown
