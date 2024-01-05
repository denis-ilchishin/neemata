// import { Extra, BaseClient } from './types'

// export type SubscriptionManagerOptions = {
//   defaultSubscriptionsKeys?: SubscriptionKeys
// }

// export class EventManager {
//   constructor() {}

// }

// export const declareEvent = <E extends string>(event: E) => {
//   return {
//     withStatic: <P = any>(): { [Key in E]: P } =>
//       //@ts-expect-error
//       ({ [event]: undefined }),
//   }
// }

// export class SubscriptionManager<Events extends Extra = Extra, Subs extends Subscriptions<Events> = SubscrФptions<Events>> {
//   constructor(
//     protected options: SubscriptionManagerOptions,
//     protected subscriptions: Subs
//   ) {}

//   async subscribe(
//     client: BaseClient,
//     subscription: Subs[number]['name']
//   ): Promise<void> {}

//   async unsubscribe(
//     client: BaseClient,
//     subscription: Subs[number]['name']
//   ): Promise<void> {}

//   async publish<T extends Subs[number]['name']>(
//     client: BaseClient,
//     subscription: T,
//     payload: Subs,
//     keys?: Extra
//   ): Promise<void> {}
// }

// export type SubscriptionKeys<Client extends BaseClient = BaseClient> = (
//   client: Client
// ) => Record<string, string>

// export type Subscription<
//   Events extends Extra = Extra,
//   Name extends string = string,
// > = {
//   name: string
//   keys: SubscriptionKeys
//   event: keyof Events
// }

// export type Subscriptions<Events extends Extra = Extra> = Subscription<
//   Events,
//   string,
// >[]

// export const declareSubscriptions = <
//   T extends Record<string, Omit<Subscription, 'name'>>
// >(
//   subscriptions: T
// ): { [K in keyof T]: Subscription<Extra, Exclude<K, number | symbol>> } => {
//   // @ts-expect-error
//   for (const key in subscriptions) subscriptions.name = key
//   // @ts-expect-error
//   return subscriptions
// }

// const subscriptions = declareSubscriptions({
//   'user:created': {
//     event: 'фыв',
//     keys: (client) => client.data.user.id
//   }
// })
