// type Replace<T, From, To> = T extends (...args: any[]) => any
//   ? T
//   : {
//       [K in keyof T]: [T[K], From] extends [From, T[K]]
//         ? To
//         : Replace<T[K], From, To>
//     }

// type ApiCall<
//   T extends import('@neemata/core/types/external').Procedure<any, any, any, any>
// > = (
//   data?: Replace<
//     Parameters<T['handler']>[0]['data'],
//     Stream,
//     import('@neemata/client').Stream
//   >
// ) => Promise<Awaited<ReturnType<T['handler']>>>

type IsEmpty<T> = keyof T extends never ? true : false
type Resolve<T> = IsEmpty<T> extends false
  ? 'default' extends keyof T
    ? T['default']
    : never
  : never
