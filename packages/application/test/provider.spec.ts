import { beforeEach, describe, expect, it } from 'vitest'

import { Provider } from '../lib/container'
import { Scope } from '../lib/types'

describe.sequential('Provider', () => {
  let provider: Provider

  beforeEach(() => {
    provider = new Provider()
  })

  it('should be a provider', () => {
    expect(provider).toBeDefined()
    expect(provider).toBeInstanceOf(Provider)
  })

  it('should clone with a value', () => {
    const value = () => {}
    const newProvider = provider.withValue(value)
    expect(newProvider.value).toBe(value)
    expect(newProvider).not.toBe(provider)
  })

  it('should clone with a factory', () => {
    const factory = () => {}
    const newProvider = provider.withFactory(factory)
    expect(newProvider.factory).toBe(factory)
    expect(newProvider).not.toBe(provider)
  })

  it('should clone with a disposal', () => {
    const dispose = () => {}
    const newProvider = provider.withDisposal(dispose)
    expect(newProvider.dispose).toBe(dispose)
    expect(newProvider).not.toBe(provider)
  })

  it('should clone with a scope', () => {
    const newProvider = provider.withScope(Scope.Call)
    expect(newProvider.scope).toBe(Scope.Call)
    expect(newProvider).not.toBe(provider)
  })

  it('should clone with a options', () => {
    let newProvider = provider.withOptions({ some: 'option' })
    expect(newProvider.options).to.deep.eq({ some: 'option' })
    expect(newProvider).not.toBe(provider)
    newProvider = provider.withOptions({ some: 'option', other: 'option' })
    expect(newProvider.options).to.deep.eq({ some: 'option', other: 'option' })
    expect(newProvider.scope).not.toBe(Scope.Transient)
  })

  it('should clone with a dependencies', () => {
    const dep1 = new Provider().withValue('dep1')
    const dep2 = new Provider().withValue('dep2')

    const newProvider = provider.withDependencies({ dep1 })
    const newProvider2 = newProvider.withDependencies({ dep2 })

    expect(newProvider2.dependencies).toHaveProperty('dep1', dep1)
    expect(newProvider2.dependencies).toHaveProperty('dep2', dep2)

    expect(newProvider2).not.toBe(newProvider)
    expect(newProvider2).not.toBe(provider)
  })
})
