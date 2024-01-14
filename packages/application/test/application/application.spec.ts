import { beforeEach, describe, expect, it } from 'vitest'

import { Application } from '@/application'
import { defaultApp } from '../_app'

describe.sequential('Application', () => {
  let app: Application

  beforeEach(() => {
    app = defaultApp()
  })

  it('should be an application', () => {
    expect(app).toBeDefined()
    expect(app).instanceOf(Application)
  })
})
