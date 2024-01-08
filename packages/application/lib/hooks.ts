export class Hooks {
  readonly #hooks = new Map<string, Set<(...args: any[]) => any>>()

  constructor() {}

  addHook(name: string, hook: (...args: any[]) => any) {
    let hooks = this.#hooks.get(name)
    if (!hooks) this.#hooks.set(name, (hooks = new Set()))
    hooks.add(hook)
    return this
  }
}
