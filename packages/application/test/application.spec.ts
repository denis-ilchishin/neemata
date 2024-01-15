import { Application } from '@/application'
import { testApp } from './_utils'

describe.sequential('Application', () => {
  let app: Application

  beforeEach(() => {
    app = testApp()
  })

  it('should be an application', () => {
    expect(app).toBeDefined()
    expect(app).instanceOf(Application)
  })
})
